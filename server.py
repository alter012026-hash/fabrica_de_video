"""Servidor local e adaptadores de IA do Estúdio Vídeo."""
from __future__ import annotations
import json
import base64
import hmac
import ipaddress
import mimetypes
import secrets
import socket
import tempfile
import threading
import wave
import re
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
ACCESS_PASSWORD_FILE = ROOT / ".lan_access_password"
ACCESS_USERNAME = "estudio"
ALLOWED_VOICES = {"pt_BR-faber-medium"}
FALLBACK_TEXT_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]
VOICE_LOCK = threading.Lock()


def load_access_password():
    """Create and persist the password used to access the app on the LAN."""
    try:
        password = ACCESS_PASSWORD_FILE.read_text(encoding="utf-8").strip()
        if len(password) >= 16:
            return password
    except OSError:
        pass
    password = secrets.token_urlsafe(18)
    try:
        ACCESS_PASSWORD_FILE.write_text(password + "\n", encoding="utf-8")
    except OSError as exc:
        raise RuntimeError("Não foi possível guardar a senha. Extraia o projeto em uma pasta com permissão de gravação.") from exc
    return password


ACCESS_PASSWORD = load_access_password()


def groq_client(api_key):
    try:
        from groq import Groq
    except ImportError as exc:
        raise RuntimeError("Cliente Groq ausente. Feche e reabra o iniciar_windows.bat para instalar a dependência atualizada.") from exc
    # Cloudflare (erro 1010) bloqueia assinaturas de cliente desconhecidas; enviamos um User-Agent de navegador.
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
    return Groq(api_key=api_key, timeout=180, max_retries=0, default_headers=headers)


def groq_error_message(error, model=None):
    message = str(error)
    lower = message.lower()
    status = getattr(error, "status_code", None)
    if "1010" in lower:
        return "Cloudflare bloqueou a conexão à Groq (erro 1010) antes de validar a chave. O app já usa o cliente oficial da Groq; tente outra rede ou contate o suporte da Groq se persistir."
    if status == 401 or "invalid_api_key" in lower or "invalid api key" in lower:
        return "A Groq recusou a chave API. Confira se copiou a chave completa em console.groq.com/keys e gere outra se necessário. Não envie sua chave nesta conversa."
    if status in (400, 404) and ("model" in lower or "model_decommissioned" in lower):
        return f"A Groq não aceitou o modelo '{model or ''}'. Atualize a lista de modelos disponíveis e escolha outro. Detalhe: {message[:500]}"
    if status == 429:
        return "A Groq informou que o limite de uso foi atingido. Confira as cotas da sua conta e tente novamente mais tarde."
    return f"Erro da Groq: {message[:900]}"


class AppHandler(BaseHTTPRequestHandler):
    server_version = "EstudioVideo/3.5"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def authenticate(self):
        supplied = self.headers.get("Authorization", "")
        expected = "Basic " + base64.b64encode(
            f"{ACCESS_USERNAME}:{ACCESS_PASSWORD}".encode("utf-8")
        ).decode("ascii")
        if hmac.compare_digest(supplied, expected):
            return True
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Estúdio Vídeo na rede local", charset="UTF-8"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    def do_GET(self):
        if not self.authenticate(): return
        if self.path == "/api/health":
            model = MODEL_DIR / "pt_BR-faber-medium.onnx"
            self.send_json(200, {"ok": True, "voiceReady": model.exists() and model.with_suffix(model.suffix + ".json").exists()})
            return
        requested = self.path.split("?", 1)[0]
        if requested == "/": requested = "/index.html"
        path = (ROOT / requested.lstrip("/")).resolve()
        if ROOT not in path.parents and path != ROOT:
            self.send_json(403, {"error": "Acesso negado."}); return
        if not path.is_file():
            self.send_json(404, {"error": "Arquivo não encontrado."}); return
        body = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(200); self.send_header("Content-Type", mime); self.send_header("Content-Length", str(len(body))); self.send_header("X-Content-Type-Options", "nosniff"); self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        if not self.authenticate(): return
        if self.path == "/api/finalize": self.finalize_video(); return
        routes = {"/api/script", "/api/narrate", "/api/models", "/api/image-prompts", "/api/eleven/voices", "/api/eleven/tts"}
        if self.path not in routes:
            self.send_json(404, {"error": "Rota não encontrada."}); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000: raise ValueError("Pedido muito grande.")
            data = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/api/script": self.generate_script(data)
            elif self.path == "/api/models": self.list_models(data)
            elif self.path == "/api/image-prompts": self.generate_image_prompts(data)
            elif self.path == "/api/eleven/voices": self.eleven_voices(data)
            elif self.path == "/api/eleven/tts": self.eleven_tts(data)
            else: self.generate_voice(data)
        except ValueError as exc: self.send_json(400, {"error": str(exc)})
        except Exception as exc: self.send_json(500, {"error": f"Erro local: {exc}"})

    def generate_script(self, data):
        key = str(data.get("apiKey", "")).strip()
        idea = str(data.get("idea", "")).strip()
        model = str(data.get("model", "openai/gpt-oss-20b"))
        if not key: self.send_json(400, {"error": "Informe a chave API da Groq."}); return
        if not idea: self.send_json(400, {"error": "Descreva a ideia do vídeo."}); return
        if len(idea) > 6000: self.send_json(400, {"error": "A ideia deve ter no máximo 6.000 caracteres."}); return
        prompt = (
            "Escreva um roteiro COMPLETO e aprofundado de vídeo em português brasileiro, para ser narrado em voz alta. "
            "Retorne SOMENTE JSON válido com as chaves: title (título atraente), logline (1 frase com a promessa do vídeo) e scenes. "
            "scenes é uma lista de 8 a 12 objetos, seguindo esta estrutura narrativa: (1) gancho forte nos primeiros segundos, com pergunta, contraste ou situação concreta; "
            "(2) contexto: por que o tema importa para o público; (3) desenvolvimento em 4 a 8 cenas, cada uma com UMA ideia central, explicada com exemplo prático, analogia ou comparação do cotidiano, e ligada à anterior por uma transição natural; "
            "(4) clímax ou ponto mais surpreendente; (5) fechamento com resumo do aprendizado e chamada para ação. "
            "Cada cena contém: scene_title (rótulo curto); narration (3 a 5 frases completas, 45 a 80 palavras, fluida, sem listas, sem repetir ideias de cenas anteriores, com ritmo de fala natural); "
            "visual_hint (o que aparece na tela, em português, concreto); image_prompt_en (prompt visual detalhado EXCLUSIVAMENTE em inglês: assunto, cenário, composição, enquadramento, iluminação, paleta e estilo, coerente com as demais cenas; sem texto, letras, logos ou marca d'água); "
            "duration (segundos, inteiro entre 8 e 25, proporcional ao tamanho da narração, ~2,5 palavras por segundo). "
            "Regras: o roteiro deve fazer sentido do início ao fim, com começo, meio e fim claros; use linguagem simples e específica, evitando clichês e frases vazias como 'neste vídeo vamos ver'; "
            "não invente estatísticas, datas, nomes ou fontes — se um dado for necessário, escreva de forma genérica ou marque '[verificar]'. "
            f"Público: {data.get('audience','público geral')}. Tom: {data.get('tone','claro e envolvente')}. Formato: {data.get('format','landscape')}.\nIdeia: " + idea)
        try:
            client = groq_client(key)
            result = client.chat.completions.create(model=model, messages=[{"role": "system", "content": "Você é um roteirista sênior de vídeos educativos e de divulgação, com domínio de narrativa, ritmo e didática. Planeje o arco completo antes de escrever e entregue textos ricos, específicos e coerentes. Responda exclusivamente com um objeto JSON válido, sem markdown. image_prompt_en deve estar inteiramente em inglês."}, {"role": "user", "content": prompt}], temperature=0.7, max_completion_tokens=9000, response_format={"type": "json_object"})
        except Exception as err:
            status = getattr(err, "status_code", None)
            self.send_json(status if isinstance(status, int) else 502, {"error": groq_error_message(err, model)}); return
        content = result.choices[0].message.content or ""
        self.send_json(200, {"content": content})

    def list_models(self, data):
        key = str(data.get("apiKey", "")).strip()
        if not key: self.send_json(400, {"error": "Cole a chave API para consultar os modelos da sua conta."}); return
        try:
            client = groq_client(key)
            ids = [item.id for item in client.models.list().data]
            blocked = ("whisper", "orpheus", "tts", "speech", "prompt-guard", "safeguard", "moderation")
            models = [model_id for model_id in ids if model_id and not any(token in model_id.lower() for token in blocked)]
            if not models: models = FALLBACK_TEXT_MODELS.copy()
            preferred = FALLBACK_TEXT_MODELS
            models.sort(key=lambda model_id: (preferred.index(model_id) if model_id in preferred else len(preferred), model_id))
            self.send_json(200, {"models": models, "fallback": False})
        except Exception as err:
            if "1010" in str(err).lower():
                self.send_json(200, {"models": FALLBACK_TEXT_MODELS, "fallback": True, "message": "A listagem foi bloqueada; usando modelos de texto padrão. A geração tentará a chamada direta."}); return
            status = getattr(err, "status_code", None)
            self.send_json(status if isinstance(status, int) else 502, {"error": groq_error_message(err)})

    def generate_image_prompts(self, data):
        key = str(data.get("apiKey", "")).strip()
        model = str(data.get("model", "openai/gpt-oss-20b"))
        raw_scenes = data.get("scenes", [])
        style = str(data.get("style", "cinematic photorealistic"))[:120]
        if not key: self.send_json(400, {"error": "Informe a chave API da Groq."}); return
        if not isinstance(raw_scenes, list) or not raw_scenes: self.send_json(400, {"error": "Nenhuma cena foi enviada."}); return
        if len(raw_scenes) > 16: self.send_json(400, {"error": "Gere prompts para até 16 cenas por vez."}); return
        scenes = [{"index": i + 1, "narration": str(item.get("narration", ""))[:1200], "visual_hint": str(item.get("visual_hint", ""))[:500]} for i, item in enumerate(raw_scenes) if isinstance(item, dict)]
        if not scenes or any(not item["narration"].strip() for item in scenes): self.send_json(400, {"error": "Cada cena precisa ter uma descrição ou narração."}); return
        prompt = f"For each numbered video scene, create one distinct, detailed image-generation prompt in English. Match the scene meaning and visual style '{style}'. Describe subject, composition, camera framing, lighting, palette and atmosphere. Do not put text, lettering, logos, captions or watermarks in the image. Preserve scene numbers. Return only JSON: {{\"prompts\":[{{\"index\":1,\"image_prompt_en\":\"...\"}}]}} with exactly one item per scene. Scenes: {json.dumps(scenes, ensure_ascii=False)}"
        try:
            client = groq_client(key)
            result = client.chat.completions.create(model=model, messages=[{"role": "system", "content": "You write image-generation prompts. Return only valid JSON. All image_prompt_en values must be written entirely in English."}, {"role": "user", "content": prompt}], temperature=0.55, max_completion_tokens=2200, response_format={"type": "json_object"})
        except Exception as err:
            status = getattr(err, "status_code", None)
            self.send_json(status if isinstance(status, int) else 502, {"error": groq_error_message(err, model)}); return
        self.send_json(200, {"content": result.choices[0].message.content or ""})

    def eleven_request(self, url, key, payload=None):
        headers = {"xi-api-key": key, "User-Agent": "EstudioVideo/2.8", "Accept": "*/*"}
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8"); headers["Content-Type"] = "application/json"
        return urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers, method="POST" if body else "GET"), timeout=120)

    def eleven_error(self, err):
        try: detail = json.loads(err.read().decode("utf-8", "replace")).get("detail", {})
        except Exception: detail = {}
        text = detail.get("message", "") if isinstance(detail, dict) else str(detail)
        code = err.code
        if code == 401: msg = "A ElevenLabs recusou a chave ou ela não tem a permissão necessária (text_to_speech / voices_read). " + text
        elif code == 402 or "quota" in text.lower(): msg = "Créditos ou plano da ElevenLabs insuficientes para esta geração. " + text
        elif code == 404: msg = "Voz não encontrada na sua conta. Confira o ID da voz. " + text
        elif code == 422: msg = "A ElevenLabs rejeitou os parâmetros (modelo, voz ou texto). " + text
        elif code == 429: msg = "Limite de requisições da ElevenLabs atingido. Aguarde e tente novamente."
        else: msg = f"Erro da ElevenLabs (HTTP {code}). {text}"
        self.send_json(code if code in (400, 401, 402, 404, 422, 429) else 502, {"error": msg.strip()})

    def eleven_voices(self, data):
        key = str(data.get("apiKey", "")).strip()
        if not key: self.send_json(400, {"error": "Informe a chave API da ElevenLabs."}); return
        try:
            with self.eleven_request("https://api.elevenlabs.io/v1/voices", key) as resp: payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err: self.eleven_error(err); return
        except Exception as err: self.send_json(502, {"error": f"Não foi possível falar com a ElevenLabs: {err}"}); return
        voices = [{"id": v.get("voice_id"), "name": v.get("name", "Voz"), "category": v.get("category", ""), "lang": (v.get("labels") or {}).get("language", "")} for v in payload.get("voices", []) if v.get("voice_id")]
        voices.sort(key=lambda v: (v["lang"] != "pt", v["name"].lower()))
        self.send_json(200, {"voices": voices})

    def eleven_tts(self, data):
        key = str(data.get("apiKey", "")).strip(); voice = str(data.get("voiceId", "")).strip(); model = str(data.get("model", "eleven_multilingual_v2")).strip(); text = str(data.get("text", "")).strip()
        if not key: self.send_json(400, {"error": "Informe a chave API da ElevenLabs."}); return
        if not re.fullmatch(r"[A-Za-z0-9]{10,40}", voice): self.send_json(400, {"error": "ID de voz inválido."}); return
        if not re.fullmatch(r"[a-z0-9_]{3,40}", model): self.send_json(400, {"error": "Modelo inválido."}); return
        if not text: self.send_json(400, {"error": "Não há texto para narrar."}); return
        if len(text) > 9000: self.send_json(400, {"error": "Cada cena pode ter até 9.000 caracteres."}); return
        def num(name, default, lo, hi):
            try: return max(lo, min(hi, float(data.get(name, default))))
            except (TypeError, ValueError): return default
        payload = {"text": text, "model_id": model, "voice_settings": {"stability": num("stability", .5, 0, 1), "similarity_boost": num("similarity", .75, 0, 1), "style": num("style", 0, 0, 1), "speed": num("speed", 1, .7, 1.2), "use_speaker_boost": True}}
        if model in ("eleven_flash_v2_5", "eleven_turbo_v2_5"): payload["language_code"] = "pt"
        try:
            with self.eleven_request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128", key, payload) as resp: audio = resp.read()
        except urllib.error.HTTPError as err: self.eleven_error(err); return
        except Exception as err: self.send_json(502, {"error": f"Não foi possível falar com a ElevenLabs: {err}"}); return
        self.send_response(200); self.send_header("Content-Type", "audio/mpeg"); self.send_header("Content-Length", str(len(audio))); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(audio)

    def finalize_video(self):
        import shutil, subprocess
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg: self.send_json(501, {"error": "ffmpeg não instalado."}); return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 1_500_000_000: self.send_json(400, {"error": "Arquivo inválido."}); return
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = Path(tmp) / "in.webm", Path(tmp) / "out.webm"
            with open(src, "wb") as fh:
                left = length
                while left > 0:
                    chunk = self.rfile.read(min(1 << 20, left))
                    if not chunk: break
                    fh.write(chunk); left -= len(chunk)
            try: subprocess.run([ffmpeg, "-y", "-v", "error", "-i", str(src), "-c", "copy", str(dst)], check=True, timeout=600)
            except Exception as err: self.send_json(500, {"error": f"Falha ao finalizar: {err}"}); return
            data = dst.read_bytes()
        self.send_response(200); self.send_header("Content-Type", "video/webm"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def generate_voice(self, data):
        text = str(data.get("text", "")).strip()
        voice = str(data.get("voice", "pt_BR-faber-medium"))
        try: rate = max(0.75, min(1.25, float(data.get("rate", 1))))
        except (TypeError, ValueError): rate = 1.0
        if voice not in ALLOWED_VOICES: self.send_json(400, {"error": "Voz não disponível."}); return
        if not text: self.send_json(400, {"error": "Não há texto para narrar."}); return
        if len(text) > 15000: self.send_json(400, {"error": "A narração pode ter até 15.000 caracteres por vez."}); return
        model = MODEL_DIR / f"{voice}.onnx"
        if not model.exists(): self.send_json(503, {"error": "Modelo de voz ausente. Execute configurar_windows.bat e tente novamente."}); return
        try:
            from piper import PiperVoice, SynthesisConfig
        except ImportError:
            self.send_json(503, {"error": "Piper não instalado. Execute configurar_windows.bat."}); return
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp: output = Path(tmp.name)
        try:
            with VOICE_LOCK:
                voice_model = PiperVoice.load(str(model))
                config = SynthesisConfig(length_scale=1.0 / rate)
                with wave.open(str(output), "wb") as wav_file: voice_model.synthesize_wav(text, wav_file, syn_config=config)
            wav = output.read_bytes()
            self.send_response(200); self.send_header("Content-Type", "audio/wav"); self.send_header("Content-Length", str(len(wav))); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(wav)
        finally:
            try: output.unlink(missing_ok=True)
            except OSError: pass

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(body)


class PrivateNetworkHTTPServer(ThreadingHTTPServer):
    """Accept loopback and private-network clients, never public Internet IPs."""
    allow_reuse_address = True

    def verify_request(self, request, client_address):
        try:
            address = ipaddress.ip_address(client_address[0])
            return address.is_private or address.is_loopback
        except ValueError:
            return False


def local_network_ip():
    """Return the IPv4 address Windows uses to reach the local network."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.0.2.1", 80))
        address = probe.getsockname()[0]
        if not address.startswith("127."):
            return address
    except OSError:
        pass
    finally:
        probe.close()
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            address = item[4][0]
            if not address.startswith("127."):
                return address
    except OSError:
        pass
    return None

if __name__ == "__main__":
    host, port = "0.0.0.0", 8787
    lan_ip = local_network_ip()
    print("Estúdio Vídeo iniciado com acesso protegido à rede privada.")
    print("No computador: http://127.0.0.1:8787")
    if lan_ip:
        print(f"No iPhone (mesma rede Wi-Fi): http://{lan_ip}:{port}")
    else:
        print("Não consegui detectar o IP da rede. Consulte o IPv4 com ipconfig.")
    print(f"Usuário: {ACCESS_USERNAME}")
    print(f"Senha de acesso: {ACCESS_PASSWORD}")
    print("No iPhone, mantenha o computador ligado e conectado ao mesmo Wi-Fi.")
    print("Feche esta janela para parar o servidor.")
    PrivateNetworkHTTPServer((host, port), AppHandler).serve_forever()
