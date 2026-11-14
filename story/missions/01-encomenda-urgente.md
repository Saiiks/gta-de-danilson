---
id: 01-encomenda-urgente
title: Missão 1 — A Encomenda
start: CASA-01
target: COM-05
objective: Leve a maleta até COM-05
---

## CUTSCENE_INICIO
left: guanabara
right: beto
bg: Frente da CASA-01

- Beto: Guanabara, preciso que leve esta maleta até o COM-05 o quanto antes.
- Guanabara: Pode deixar comigo. Vou pegar um carro na rua e seguir a rota pelo minimapa.
- Beto: Cuidado nas curvas e não caia na água nas bordas da ilha!

## CUTSCENE_FIM
left: guanabara
right: clara
bg: Entrada do COM-05

- Clara: Você chegou rápido, guanabara. Trouxe a maleta?
- guanabara: Está inteira aqui comigo. O que fazemos agora?
- OPCAO: Entregar a maleta para Clara -> COMPLETE
- OPCAO: Fugir com a maleta pela cidade -> GAMEOVER: Você tentou fugir com a maleta e foi cercado pela segurança do local!
