---
id: 05-chave-do-vibe-coding
title: Missão 5 — A Chave do Vibe Coding
start: CASA-656
pickup: PRACA-29
pickup_objective: Pegue a Chave Mestra em PRACA-29
target: CASA-353
objective: Leve a Chave Mestra até Lucia em CASA-353
give_item: chave-secreta
require_item: chave-secreta
delivery_prompt: Lucia está com a Caixa Secreta em CASA-353. Entregue a Chave Mestra para abri-la:
wrong_item_message: Lucia balançou a cabeça: "Essa chave não gira nem parafuso! Use a Chave Mestra!"
---

## CUTSCENE_INICIO
left: guanabara
right: lucia
bg: Sudeste da cidade em CASA-656

- Lucia: Guanabara, o Jason e eu já preparamos toda a bancada aqui em CASA-353! Só falta a Chave Mestra que o Sam Maltmon mencionou!
- Guanabara: Tô saindo do Sudeste agora mesmo! A PRACA-29 fica logo ali na esquina.
- Lucia: Pega a chave e vem pro Centro! Toda a equipe está curiosa para saber o que tem dentro da Caixa Secreta!

## CUTSCENE_FIM
left: guanabara
right: lucia
bg: Interior da CASA-353

- Lucia: Você conseguiu cruzar a cidade inteira, Guanabara! A Caixa Secreta está bem aqui na mesa, e Jason já deixou tudo pronto no estúdio.
- Guanabara: Foi placa de vídeo, servidor alucinado, robô fazendo deploy na sexta... mas chegamos!
- OPCAO: Chegou a hora da verdade! Bora girar essa chave! -> NEXT
- OPCAO: Se sair um código em Python pronto daí de dentro eu não me surpreendo! -> NEXT
- OPCAO: Olá, Pequeno Gafanhoto... prepare o coração! -> NEXT
- Lucia: Então não faz suspense! Passa a Chave Mestra e vamos abrir agora:
- ENTREGAR: chave-secreta
- Guanabara: Olha só o que tem dentro da Caixa Secreta... um convite dourado e o roteiro oficial!
- Lucia: É isso mesmo! O Curso em Vídeo vai lançar o novo Curso de Vibe Coding, preparando a nova geração de programadores que estão chegando no mercado!
- Guanabara: Sem perder a base, pensando como desenvolvedor e usando a Inteligência Artificial como parceira! Pode soltar a vinheta, porque o próximo curso já vai começar!
