# Estúdio Vídeo — arquitetura modular

Aplicativo local para criar vídeos no navegador. O roteiro usa a API GroqCloud quando o usuário fornece sua própria chave. A narração em português é sintetizada pelo Piper no computador que executa o servidor; imagens, áudio e vídeo são montados no navegador.

## Executar no Windows

1. Instale Python 3.10 ou superior.
2. Extraia o pacote ZIP em uma pasta gravável.
3. Execute `configurar_windows.bat` uma vez. O instalador cria o ambiente Python e baixa o modelo Piper PT-BR (aprox. 63 MB).
4. Execute `iniciar_windows.bat` para abrir o estúdio no navegador.
5. Cole uma chave GroqCloud em **Projeto e roteiro**. A chave e o modelo selecionado ficam salvos no armazenamento local do navegador para você não precisar informá-los novamente. A chave não é incluída no arquivo JSON do projeto; ela é enviada ao servidor local somente para as solicitações à Groq. Apagar os dados do navegador remove a chave salva.

## Acessar pelo iPhone na mesma rede Wi-Fi

1. Deixe o computador e o iPhone conectados à mesma rede Wi-Fi. Evite rede de convidados, que pode bloquear a comunicação entre aparelhos.
2. Inicie o estúdio com `iniciar_windows.bat` no computador. Na primeira execução, o Windows pode perguntar se o Python pode aceitar conexões: permita somente em **redes privadas**.
3. Mantenha a janela do servidor aberta. Ela mostra o endereço IPv4 para abrir no iPhone, o usuário `estudio` e a senha de acesso. A senha é gerada e guardada no arquivo local `.lan_access_password`; ela não é enviada ao GitHub.
4. No iPhone, abra o endereço mostrado no Safari e entre com o usuário e senha do terminal. Para acesso rápido, use **Compartilhar → Adicionar à Tela de Início**.
5. Configure a chave Groq uma vez nesse endereço do Safari. Ela fica salva nesse navegador enquanto os dados do site não forem apagados. Se o IP do computador mudar, o endereço muda e a chave poderá precisar ser informada novamente.

O computador precisa permanecer ligado e conectado ao Wi-Fi para gerar roteiro e narração. O servidor aceita apenas conexões locais e de endereços privados, além de exigir senha. Não configure encaminhamento de porta no roteador nem use o servidor em uma rede Wi-Fi pública. O acesso local usa HTTP; utilize somente uma rede privada de confiança.

O uso da API Groq depende da conta, dos modelos disponíveis e das cotas vigentes. O Piper e a síntese rodam localmente; o custo computacional é do próprio computador. Confira a licença da voz/modelo antes de uso comercial.

## Recursos

- Roteiro e storyboard por Groq Chat Completions, com tom, público e formato.
- Consulta dinâmica do endpoint de modelos da sua conta para evitar IDs desativados/depreciados.
- Voz neural PT-BR Piper, geração WAV local e controle de velocidade.
- Cada cena do roteiro recebe um prompt de imagem detalhado em inglês; pode editar/copiar e gerar novamente por cena.
- Prompts em lote para cenas existentes, com seleção de estilo visual.
- Importação de imagens, narração externa e música de fundo.
- Edição de duração e transições por cena: corte, dissolvência, deslize, zoom e revelação.
- Legendas gravadas na imagem e mixagem de voz + música.
- Saída WebM 720p ou 1080p, vertical, paisagem e quadrada.
- Salvar/abrir projeto JSON; arquivos de áudio devem ser escolhidos novamente ao reabrir.
- Layout responsivo para celular, com áreas de toque ampliadas.

## Arquitetura

```text
index.html
assets/css/style.css       interface e estilos
src/app.js                 composição da interface e eventos
src/state.js               estado e persistência JSON
src/groq.js                cliente HTTP para roteiro
src/narration.js           geração/gestão de voz
src/sceneEditor.js         editor de cenas e arquivos de imagem
src/renderer.js            canvas, legendas e transições
src/exporter.js            gravação WebM e mixagem de áudio
server.py                  servidor local, proxy Groq e Piper
```

O servidor escuta na rede privada para permitir o acesso pelo celular, exige autenticação HTTP e rejeita endereços públicos. A chave Groq é guardada no armazenamento local do navegador e enviada ao servidor local apenas durante chamadas à API; ela não é gravada em arquivo nem incluída no projeto exportado. Os modelos são consultados pelo endpoint oficial `/openai/v1/models` e os IDs antigos são filtrados pela lista ativa da conta.

## Atualização 3.4

A interface foi ajustada para celulares, com etapas reorganizadas em grade, controles maiores para toque e campos mais confortáveis. A chave Groq e o modelo escolhido agora são lembrados no navegador.

## Atualização 3.5

O servidor pode ser acessado pelo iPhone na mesma rede Wi-Fi do computador. Ele cria uma senha local persistente, mostra o endereço IPv4 no terminal e aceita apenas conexões de rede privada ou do próprio computador.

## Atualização 2.5

A comunicação com a Groq usa agora o cliente oficial Python. A geração não depende da consulta `/models`: se a listagem sofrer bloqueio Cloudflare 1010, a interface oferece modelos conhecidos e tenta a chamada de chat diretamente. O inicializador instala `groq` automaticamente quando falta.

## Atualização 2.4

A interface está organizada em quatro etapas navegáveis: projeto/roteiro, cenas/imagens, narração/música e revisão/exportação. Cada etapa possui avanço e retorno; a geração do roteiro leva diretamente à revisão das cenas.

## Atualização 2.3

O cliente HTTP agora envia um identificador descritivo do aplicativo nas chamadas à Groq para evitar o erro Cloudflare 1010 associado ao user-agent padrão do Python. Se o 1010 persistir, a rede ou a proteção da Groq ainda está bloqueando a requisição.

## Atualização 2.2

Cada cena gerada agora traz `image_prompt_en`, uma descrição visual detalhada em inglês para usar no gerador de imagens de sua preferência. O painel permite ajustar o prompt, copiá-lo, regenerar por cena e pedir prompts para todas as cenas.

## Atualização 2.1

Os IDs `llama-3.1-8b-instant` e `llama-3.3-70b-versatile` foram removidos da seleção. Ao informar a chave, use **Conferir modelos disponíveis** para consultar os modelos ativos da conta. O padrão passa a ser `openai/gpt-oss-20b`.

## Limites conhecidos

- A saída é WebM. O navegador não inclui uma conversão final para MP4 nesta versão.
- A trilha deve ser selecionada pelo usuário; use áudio próprio ou com licença adequada.
- O roteiro é um rascunho e deve ser revisado, especialmente em assuntos factuais.
- Exportações longas ou em 1080p exigem mais memória e processamento.
