# Publicar a extensão na Chrome Web Store

Tudo o que a loja pede está nesta pasta. Publicar precisa da sua conta Google de desenvolvedor
(taxa única de US$ 5): https://chrome.google.com/webstore/devconsole

## 1. Pacote

```sh
./extensao/empacotar.sh     # gera extensao/loja/cineminha-loja.zip (sem localhost)
```

Envie `cineminha-loja.zip` em **Itens → Novo item**. A cada versão nova, suba o número em
`extensao/netflix/manifest.json`, rode o script de novo e envie em **Pacote → Enviar novo pacote**.

## 2. Página da loja

- **Nome**: `Cineminha` *(a loja costuma recusar nomes com marca de terceiros, como "Netflix"; por isso o
  nome publicado não leva "· Netflix". Se quiser manter, troque em `manifest.json` antes de enviar.)*
- **Resumo** (até 132 caracteres):
  `Projete a aba no Cineminha sem a faixa do Chrome e deixe a sala pausar, pular e ver o que está passando na Netflix.`
- **Categoria**: Entretenimento · **Idioma**: Português (Brasil)
- **Descrição**:

  > O Cineminha é uma sala para assistir filmes e séries com os amigos, com voz, chat e jogos.
  > Esta extensão liga a sua aba da Netflix à sala:
  >
  > • Projete a aba com um clique, com imagem e som, sem a faixa “Compartilhando esta guia”.
  > • Todo mundo vê série, temporada, episódio e a nota do IMDb do que está passando.
  > • Qualquer pessoa da sala dá play, pausa, volta e avança (ou só você, se preferir).
  > • Abertura e resumo se pulam com um clique, ou sozinhos.
  > • No fim do episódio, a sala vota se vê mais um e dá nota.
  >
  > Funciona com o site https://cineminha-boo.vercel.app.

- **Imagens**: `tela-1.png`, `tela-2.png`, `tela-3.png` (1280×800) e `promo-440x280.png` (bloco promocional
  pequeno). O ícone 128×128 já vai no pacote. As telas usam um quadro de filme como fundo; se preferir,
  troque por um print seu da Netflix.
- **Política de privacidade**: https://cineminha-boo.vercel.app/privacidade.html

## 3. Privacidade (aba "Práticas de privacidade")

- **Finalidade única**: “Ligar a aba da Netflix a uma sala do Cineminha para projetar e controlar o vídeo em grupo.”
- **Justificativa das permissões**:
  - `tabCapture`: projetar a aba que a pessoa escolhe ao clicar no botão da extensão.
  - `scripting`: entrar nas abas da Netflix e do Cineminha que já estavam abertas quando a extensão é instalada.
  - Host `netflix.com`: ler o estado do player (pausado, tempo, título) e executar play, pausa e pular.
  - Host `cineminha-boo.vercel.app`: conversar com a página da sala.
- **Dados coletados**: nenhum. Marque que não vende nem transfere dados e que não usa para crédito.
- **Código remoto**: não usa.

## 4. Depois de aprovada

A loja dá um ID novo para a extensão. Quem tinha a versão sem compactação deve removê-la e instalar
pela loja; dali em diante as atualizações chegam sozinhas. Troque o link de `/baixar/extensao`
(em `vercel.json`) pelo link da loja.
