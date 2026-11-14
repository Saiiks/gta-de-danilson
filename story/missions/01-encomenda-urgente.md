---
id: 01-encomenda-urgente
title: Missão 1 — A Encomenda
start: CASA-01
pickup: PRACA-02
pickup_objective: Pegue a maleta em PRACA-02
target: COM-05
objective: Leve a maleta até COM-05
give_item: maleta-executiva
require_item: maleta-executiva
delivery_prompt: Clara está aguardando a encomenda em COM-05. Escolha o item para entregar:
wrong_item_message: Clara recusou: "Não era isso que eu pedi! Selecione a Maleta Executiva."
---

## CUTSCENE_INICIO
left: guanabara
right: beto
bg: Frente da CASA-01

- Guanabara: Fala, chefe! Tudo bem aí? Qual é a missão da vez?
- Beto: Guanabara, deixei uma maleta importante na PRACA-02. Preciso que você passe lá para pegá-la e leve até o COM-05.
- OPCAO: Pode deixar comigo! Vou buscar agora mesmo. -> NEXT
- OPCAO: Tô indo, mas espero que o trânsito esteja calmo! -> NEXT
- OPCAO: Missão dada é missão cumprida, chefe. -> NEXT
- Beto: Cuidado nas curvas e não caia na água nas bordas da ilha!

## CUTSCENE_FIM
left: guanabara
right: clara
bg: Entrada do COM-05

- Clara: Você chegou rápido, Guanabara! Conseguiu pegar a maleta?
- Guanabara: Sim, passei lá e trouxe ela comigo. Aqui está:
- ENTREGAR: maleta-executiva
