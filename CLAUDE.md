# Cineminha

## Publicar (deploy)

- **Não publique por conta própria.** Cada deploy muda a versão do site e todo mundo que está na call
  reconecta (o `checkVersion` recarrega a página). A galera costuma estar assistindo ou jogando.
- Só faça commit + push para a `main` (que dispara o deploy na Vercel) quando:
  - o usuário pedir claramente ("publique", "manda", "pode subir"); ou
  - for uma correção realmente urgente (algo quebrado que impede de usar a call, o player ou um jogo
    em andamento). Mesmo assim, avise antes e explique por que é urgente.
- No resto, faça a mudança, teste no servidor local (`node tools/dev.mjs`, porta 8790; use outra porta
  com `PORT=...` se já houver um rodando) e **pergunte se pode publicar**.
- Se várias mudanças estiverem prontas, junte tudo num único deploy em vez de vários seguidos.
- Commitar só os arquivos da mudança (`git add` explícito). Outros agentes (Codex) mexem em paralelo
  nos jogos (Uno, Dobradinha/Dobro, `public/jogos/`, `tools/`): não incluir nem reverter o que é deles.
