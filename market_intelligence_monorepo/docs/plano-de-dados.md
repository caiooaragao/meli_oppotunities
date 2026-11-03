# Plano de dados: margem Mercado Livre × AliExpress

Data do plano: 22 de outubro de 2026. As regras de taxa e de imposto citadas aqui têm vigência e fonte. Quando a fonte mudar, muda a linha de referência, e o histórico calculado permanece com a regra que valia no dia.

## 1. A pergunta que o dado precisa responder

Dado um produto que aparece entre os mais vendidos do Mercado Livre, existe uma oferta comparável no AliExpress cujo custo posto no Brasil, somado à tarifa de venda e ao frete de saída, deixa margem acima de um piso — e o prazo do fornecedor cabe no prazo que o anúncio consegue prometer?

O ranking de mais vendidos responde só a primeira metade da descoberta: o que o mercado está mostrando, a que preço, em que posição. Margem, frete, prazo e projeção são contas feitas em cima de insumos guardados à parte. A margem calculada no scraper e gravada como um número único não serve: no mês seguinte a tarifa, o câmbio ou o peso mudam e não há como refazer a conta.

Cinco decisões saem desse modelo:

1. Entrar, observar ou descartar o produto.
2. A que preço de vitrine a margem segura o piso.
3. Operar como envio direto da China ou como importação com estoque no Brasil.
4. Clássico ou Premium, e em qual logística.
5. Onde o preço do Mercado Livre está comprimindo a ponto de a margem de hoje não valer daqui a duas semanas.

## 2. O que existe hoje

A tabela `best_sellers` (`db/init.sql`) guarda um item por categoria: título, preço, preço original, moeda, link, foto, posição, frete grátis sim/não, origem do bloco e `scraped_at`. A chave é `(item_id, category_id)`.

O scraper (`scrapers/mercadolivre/scrape-mais-vendidos.mjs`) lê a home e 75 páginas de `/recommendations` (5 blocos de tendência × 15 páginas), deduplica em memória e, na gravação, apaga a tabela inteira antes de inserir. A tela lê essa foto e renumerar a posição dentro da categoria.

Consequências práticas:

- Um segundo scrape substitui o primeiro. Não há série de preço, de posição nem de frete.
- A home grava `free_shipping` como falso e `original_price` como nulo. O booleano de frete da home não pode entrar em média.
- A posição é a ordem em que o item foi visto na coleta, reconstruída por categoria. É um sinal de vitrine, e é um dado diferente de unidade vendida.
- O nome da categoria na home sai do título do bloco (“em Celulares”). O id de categoria do item é o que deve mandar no join com a tabela de tarifas.
- Não há vendedor, quantidade vendida, condição, tipo de anúncio, peso, dimensão, GTIN, catálogo do Mercado Livre, nem oferta de fornecedor.
- Preço, rank e atributo estável estão na mesma linha. Peso não muda todo dia; preço muda. Misturar os dois no mesmo grão ou gera coleta cara demais ou histórico furado.

A tela atual pode continuar em cima de uma foto do último run. O que muda é que a foto deixa de ser o único lugar onde o dado existe.

## 3. Quatro coisas que passam a viver separadas

| Coisa | O que é | Com que frequência muda |
| --- | --- | --- |
| Observação de mercado | O que o anúncio mostrava naquele instante: preço, posição, frete exibido, quantidade vendida | Cada coleta |
| Identidade | O produto físico e o anúncio: marca, modelo, GTIN, unidades no kit, peso | Raro; revisar quando o título mudar de kit ou voltagem |
| Oferta de suprimento | Preço, frete internacional, prazo e o que já veio embutido no checkout do AliExpress | Cada coleta do fornecedor |
| Cenário | Câmbio, regra de imposto, tipo de anúncio, logística, reputação, UF, modo de suprimento | A regra muda por vigência; o cenário é reaplicado |

A margem é uma visão sobre esses quatro. Ela guarda os insumos e a versão da regra usada. Recalcular com a PTAX de hoje um custo de março é outro cenário, com outro `calculated_at`, e a linha antiga fica.

## 4. Camadas

```text
raw          payload bruto, append-only, um registro por request
core         observações, ofertas, correspondências, cotações de taxa e frete
referência   câmbio, regra fiscal, premissas do cenário, piso de margem
mart         uma linha por produto × cenário × dia, pronta para gráfico e ranking
```

`raw` existe para reprocessar quando o parser melhorar sem recoletar a página. O JSON da home e o JSON de recommendations hoje são descartados depois do parse.

A mart é o único lugar que a tela de oportunidade lê. Gráfico não junta cinco tabelas no componente.

## 5. Modelo

Nomes em inglês, no mesmo padrão de `best_sellers`. Dinheiro em `NUMERIC(14,2)`. Câmbio em `NUMERIC(18,8)`. Toda linha de cálculo carrega `rule_version` e `fx_rate_id`.

### 5.1 Coleta

`ingest_run`

- `run_id`, `source` (`ml_best_sellers`, `ml_item`, `aliexpress`, `fx`, `ml_fee_quote`, `ml_shipping_quote`), `started_at`, `finished_at`, `status`, `error`

`raw_payload`

- `run_id`, `source`, `entity_key`, `fetched_at`, `http_status`, `payload jsonb`
- Append-only. Sem update.

### 5.2 Mercado Livre

`listing`

- Um anúncio. `item_id` (MLB…), `category_id`, `catalog_product_id`, `seller_id`, `title`, `permalink`, `condition`, `listing_type_id` (`gold_special` clássico, `gold_pro` premium), `currency_id`
- Atributos estáveis quando a API ou a página do item responder: `gtin`, `brand`, `model`, `units_per_pack`, `weight_g`, `height_cm`, `width_cm`, `length_cm`, `weight_source` (`listing`, `category_median`, `manual`)
- `shipping_mode`, `logistic_type`, `free_shipping`, `mandatory_free_shipping`
- `attributes_checked_at`. Peso e GTIN se reconsultam quando vazios ou a cada 7 dias, e também quando o título mudar.

`listing_observation`

- Grão: anúncio × coleta. Nunca apaga a anterior.
- `run_id`, `item_id`, `category_id`, `category_name`, `title`, `price`, `original_price`, `currency_id`, `permalink`, `thumbnail`, `source`, `source_page`, `source_position`, `free_shipping`, `scraped_at`
- `sold_quantity`, `sold_quantity_raw`, `sold_quantity_kind` (`exact` ou `bucket`). “Mais de 5 mil” fica como faixa no texto bruto. A velocidade de venda só usa `exact`.
- `available_quantity`

A foto que a tela já consome continua existindo: no fim de um run bem-sucedido, o job reescreve `best_sellers` a partir da última observação. A reescrita acontece depois do commit das observações. Uma falha no meio do scrape deixa de zerar o único lugar onde o dado mora.

### 5.3 AliExpress

`supplier_offer`

- `offer_id`, `sku_id`, `store_id`, `title`, `url`, `currency`
- `units_per_pack`, `weight_g`, `dimensions` quando a página informar
- `choice`, `remessa_conforme` (o que o checkout mostrar; a premissa do cenário também tem um valor default)

`supplier_price`

- Grão: oferta × coleta
- `item_price`, `shipping_price`, `insurance_price`, `tax_shown`, `currency`
- `price_includes_shipping` (frete Choice embutido no preço do item)
- `price_includes_tax` (II e ICMS já cobrados no checkout)
- `delivery_days_min`, `delivery_days_max`, `shipping_method`
- `sold_count`, `rating`, `scraped_at`

O valor aduaneiro é mercadoria + frete internacional + seguro, antes do imposto. Frete embutido já está no preço do item e entra uma vez. Imposto mostrado no checkout entra uma vez. A flag `price_includes_tax` é o que impede a conta de somar ICMS em cima de ICMS.

A primeira carga pode ser um CSV com essas colunas. O casamento e a margem não ficam bloqueados até existir um scraper do AliExpress. Quando o scraper entrar, grava na mesma tabela, com `source` diferente.

### 5.4 Correspondência

`product`

- O produto físico que se pretende vender. `brand`, `model`, `units_per_pack`, `variation_key` (voltagem, tamanho, cor quando a cor mudar o custo), peso e dimensões de trabalho, `ml_category_id`
- Peso de trabalho: o do anúncio, senão o da oferta, senão a mediana da categoria marcada como baixa confiança

`product_listing`

- Liga anúncios comparáveis ao mesmo produto. É aqui que entram os concorrentes usados no percentil de preço. O anúncio “kit 3” e o anúncio de 1 unidade são produtos diferentes.

`product_match`

- `product_id`, `offer_id`, `method` (`gtin`, `catalog_model`, `title`, `manual`), `score`, `status` (`candidate`, `accepted`, `rejected`), `reviewed_at`
- Aceite automático só com GTIN igual e a mesma `units_per_pack`
- Score de título entre 0,60 e 0,85 fica `candidate` até revisão
- Título com kit, pack, unidades ou voltagem divergente não aceita sozinho

A comparação de preço é por unidade vendável. R$ 90 o kit com 3 unidades contra R$ 40 a unidade é margem fictícia se a ponte não carregar a quantidade.

### 5.5 Referências versionadas

`fx_rate`

- `rate_date`, `pair` (`USD/BRL`, `CNY/BRL`), `rate`, `source` (`ptax_venda`)
- A oferta guarda o `fx_rate_id` usado. Histórico não é reescrito quando a PTAX do dia seguinte sai.

`tax_rule`

- `regime` (`prc_pf`, `prc_pj_or_non_prc`, `formal_import`)
- `effective_from`, `effective_to`
- `customs_threshold_usd`, `rate_below`, `rate_above`, `deduction_usd`, `icms_rate`, `uf`
- A linha vigente para prospecção, pessoa física, site no Remessa Conforme, desde 12/05/2026: até US$ 50 de valor aduaneiro, II de 0%; acima, até US$ 3.000, II de 60% com dedução de US$ 30. ICMS por dentro, 17% em SP (o cenário base) e a alíquota da UF quando o cenário mudar. Fonte: Receita Federal, tributação de remessas, regra aplicável a DIR registrada a partir de 12/05/2026.
- `formal_import` fica com a estrutura pronta e sem alíquota chutada. Importação por CNPJ para revenda usa NCM, II, IPI, PIS, COFINS e ICMS de outro regime. A margem de Remessa Conforme pessoa física é cenário de prospecção. Ela descreve o custo de uma encomenda ao consumidor, e é um piso otimista demais para quem for revender em escala com nota. Os dois regimes aparecem como cenários distintos no mesmo produto.

`fee_quote`

- Resposta de `GET /sites/MLB/listing_prices` para a combinação `category_id + price + listing_type_id + logistic_type + shipping_mode`
- `percentage_fee`, `fixed_fee`, `financing_add_on_fee`, `sale_fee_amount`, `quoted_at`, `rule_note`
- Cache por combinação e dia. Mil anúncios da mesma categoria e da mesma faixa de preço compartilham uma cotação.
- `fee_source`: `official` quando a API responder, `fallback` quando a combinação ainda não tiver cotação. Item com fallback não entra na lista de compra; entra em observar.

`shipping_quote`

- Resposta de `GET /users/{user_id}/shipping_options/free`
- Dimensões no formato da API (`altura x largura x comprimento, peso em gramas`), `item_price`, `listing_type_id`, `mode`, `logistic_type`, `free_shipping`, `reputation`, `zip_origin`
- `list_cost`, `billable_weight`, `currency_id`, `destination_scope`
- Dois destinos fixos no cenário: um CEP de capital em São Paulo e um CEP de referência distante. A média nacional esconde o prazo e o custo do pior caso.
- Sem peso e sem dimensão, a linha nasce com `freight_status = missing_dimensions` e fica fora do ranking de compra. Mediana de peso da categoria pode preencher um cenário paralelo, com `weight_source = category_median` e confiança baixa.

As duas APIs pedem token de vendedor. Sem o token, o plano ainda organiza o dado e marca a confiança. Com o token, a cotação oficial substitui o fallback e o histórico guarda as duas, cada uma com sua fonte.

### 5.6 Cenário e mart

`scenario`

Uma linha de premissas, editável, com vigência. O cenário base está na seção 12. Clássico e Premium, envio direto e estoque, reputação verde e MercadoLíder são linhas dessa tabela, e cada uma gera uma margem. O código da fórmula lê a linha. O percentual de comissão não fica solto no scraper.

`cost_scenario`

- Grão: produto × oferta escolhida × cenário × dia
- Insumos copiados no momento do cálculo: preço de referência, câmbio, ids da regra, da cotação de tarifa e da cotação de frete, flags de imposto embutido
- Saídas, cada uma em coluna própria: `item_cost_brl`, `intl_freight_brl`, `duty_brl`, `icms_brl`, `landed_cost_brl`, `packaging_brl`, `ml_percentage_fee_brl`, `ml_fixed_fee_brl`, `ml_shipping_brl`, `ads_brl`, `contribution_margin_brl`, `contribution_margin_pct`, `min_price_brl`, `decision`
- `input_confidence` (`official`, `high`, `low`). Uma entrada baixa rebaixa a decisão para observar.

`mart_opportunity`

- A última linha de `cost_scenario` do cenário base, mais os campos de prazo e de benchmark que a tabela da seção 10 pede. É a fonte dos gráficos.

## 6. Coleta do Mercado Livre

Dois jobs, duas cadências.

**Descoberta, uma vez por dia.** O job atual permanece como fonte de quem entrou na vitrine de mais vendidos. Ele passa a inserir em `listing_observation` e só então atualiza a foto de `best_sellers`.

**Acompanhamento, uma vez por dia na lista, com espaço para subir a frequência dos preços.** A lista de acompanhamento é o conjunto de anúncios ligados a um `product` que já teve correspondência candidata ou aceita, mais os itens que ficaram no topo do ranking por categoria nos últimos 7 dias. Para cada um, buscar o que a home não traz:

- `sold_quantity` e o texto bruto
- `shipping.mode`, `shipping.logistic_type`, `shipping.free_shipping`, tag `mandatory_free_shipping`, `shipping.dimensions`
- atributos GTIN, marca, modelo, peso
- `listing_type_id`, `condition`, `catalog_product_id`, `seller_id`
- preço e preço original

A ordem de fonte é a API pública de item e, quando o campo vier vazio, a página do anúncio. Tarifa e frete de saída vêm das APIs de cotação da seção 5.5, no job de referências, uma vez por dia por combinação. Recotar o mesmo anúncio mil vezes no mesmo dia repete o mesmo número.

O que a descoberta continua sendo: sinal de demanda por presença e posição na vitrine. Unidade vendida, quando existir, vem do acompanhamento e do delta de `sold_quantity`.

## 7. Imposto de entrada

Calcular em dólar e converter II e ICMS pela mesma PTAX. A dedução de US$ 30 usa a mesma cotação do valor aduaneiro.

```text
V_usd = (mercadoria + frete internacional + seguro) em BRL / PTAX
         quando o checkout já estiver em real

se regime = prc_pf e V_usd <= 50:  II_usd = 0
se regime = prc_pf e V_usd > 50:   II_usd = 0,60 × V_usd − 30
senão:                             II_usd = 0,60 × V_usd

ICMS = (V_brl + II_brl) / (1 − alíquota) × alíquota
custo_posto = V_brl + II_brl + ICMS
```

Se `price_includes_tax` for verdadeiro, `duty_brl` e `icms_brl` recebem o valor mostrado no checkout e a fórmula acima não roda de novo. A coluna continua preenchida, com `tax_source = checkout`.

O degrau de US$ 50 é parte do dado, e vale a pena guardar `V_usd` na linha. Uma oferta de US$ 49 e outra de US$ 55 do mesmo produto podem trocar de faixa entre duas coletas por causa do frete ou do câmbio. O cálculo testa a faixa do dia. Perto do limite, a mart marca `near_threshold` quando `V_usd` está entre 45 e 60, para o ranking mostrar a sensibilidade.

Prova de regressão, com os exemplos publicados pela Receita a R$ 5,00 por dólar e ICMS de 17%:

| Valor aduaneiro | II | ICMS | Total de impostos |
| --- | ---: | ---: | ---: |
| R$ 100 (abaixo de US$ 50) | R$ 0,00 | R$ 20,48 | R$ 20,48 |
| R$ 330 (acima de US$ 50) | R$ 48,00 | R$ 77,42 | R$ 125,42 |

O segundo caso: II = 60% × 330 − 30 × 5 = 48. ICMS = (330 + 48) / 0,83 × 0,17 = 77,42. Esses dois resultados viram teste automático da função. Se a Receita mudar a dedução ou a faixa, entra uma nova linha em `tax_rule` com `effective_from`, e o teste ganha o caso novo sem apagar o antigo.

## 8. Tarifa de venda e frete de saída

São duas cobranças. A cotação de `listing_prices` devolve a tarifa. A cotação de `shipping_options` devolve o frete que o vendedor paga. Somar as duas uma vez. `sale_fee_amount` já inclui percentual e custo fixo daquele tipo de anúncio; o custo fixo não entra de novo.

Regras de MLB que a documentação de desenvolvedor descreve em 3 de setembro de 2026, depois da mudança de 2 de março de 2026. O limiar TH de frete grátis obrigatório no Brasil é R$ 79. O comprador vê frete grátis em uma faixa bem mais baixa (a partir de R$ 19 em grande parte do catálogo); isso é experiência do comprador, e o custo do vendedor muda de natureza no limiar de R$ 79.

| Situação | Custo fixo | Frete do vendedor |
| --- | --- | --- |
| Preço ≥ R$ 79 | Zero | Frete grátis obrigatório. O vendedor paga a parte que `shipping_options` devolver para o peso, o preço, a reputação e a logística. |
| Preço < R$ 79, Mercado Envios (`me2`), logística diferente de Flex | Zero, segundo a documentação da API | Em muitos anúncios o Mercado Livre banca o frete do comprador. Confirmar na cotação, com `free_shipping` verdadeiro e falso. |
| Preço < R$ 79, Flex (`self_service`) | A cotação devolve o valor | Logística do vendedor |
| Preço < R$ 79, envio próprio (`me1`, `custom`, `not_specified`) | A cotação devolve o valor | Tabela do próprio vendedor, fora do cenário base |

A tarifa percentual incide em todas essas linhas. No anúncio Clássico (`gold_special`) a faixa usual publicada para vendedores é 10% a 14% conforme a categoria. No Premium (`gold_pro`) é 15% a 19%, com parcela sem juros e o componente `financing_add_on_fee`. Livros e supermercado têm redução. No Brasil a própria API avisa que a mesma categoria pode ter percentual menor em certas faixas de preço, e que o percentual pode mudar. Por isso a categoria entra na cotação junto com o preço, e uma tabela estática de “12% para tudo” fica só como fallback marcado.

A página institucional de tarifas ainda descreve custo fixo por faixas abaixo de R$ 79 de um jeito anterior a março de 2026. A documentação da API, mais nova, descreve a árvore da tabela acima. O sistema grava o número que `listing_prices` devolver e guarda o texto da regra em `rule_note`. Na primeira semana com token, conferir três anúncios reais (abaixo de R$ 79 em `drop_off`, abaixo de R$ 79 em Flex, acima de R$ 79) e ajustar o texto da regra se a resposta divergir da árvore. O número da API permanece a fonte.

Custo de armazenagem do Full fica num cenário `logistic_type = fulfillment`, fora da prospecção inicial. Ads ficam zerados no cenário base e ligados em cenários de 5% e 10% do preço, para a margem obrigatória aparecer separada da margem depois de mídia.

## 9. Margem e preço mínimo

Margem de contribuição unitária, antes de imposto de renda, pró-labore e custo fixo da operação (aluguel, ferramenta, tempo).

```text
margem =
    preço_de_referência
  − custo_posto
  − embalagem
  − tarifa_percentual
  − custo_fixo
  − frete_de_saída
  − ads
```

`margem_pct = margem / preço_de_referência`.

O preço de referência da prospecção é o percentil 25 dos anúncios do mesmo `product` com condição novo, na janela de 28 dias. Um segundo número, o percentil 50, mostra a margem se a vitrine aguentar o meio do mercado. O menor preço do dia fica de fora da referência: kit mal casado, usado e queima distorcem o piso.

O piso do cenário base é margem de 25% e pelo menos R$ 15. Os dois valem ao mesmo tempo. Abaixo do piso, com dado completo, a decisão é observar. Margem negativa até no percentil 75 do preço de mercado é descartar: nem vendendo na parte cara da faixa a conta fecha.

O preço mínimo precisa ser resolvido por faixa, porque custo fixo e frete mudam ao cruzar R$ 79.

```text
para cada faixa (abaixo de 79, de 79 para cima):
  preço = (custo_posto + embalagem + custo_fixo_da_faixa + frete_da_faixa)
          / (1 − percentual_da_faixa − ads − margem_piso)

ficar com o menor preço que cair dentro da faixa usada no cálculo
```

Se o preço mínimo calculado com a regra “abaixo de 79” der R$ 90, ele é inválido nessa faixa e só a faixa de cima concorre. Frete que varia dentro da faixa: usar a cotação no preço candidato e repetir uma vez. Duas iterações bastam para a prospecção.

Decisão, nessa ordem:

| Decisão | Condição |
| --- | --- |
| `comprar` | Correspondência aceita, confiança oficial ou alta em peso, tarifa e frete, margem nos dois pisos no preço p25, prazo viável para o modo de suprimento |
| `observar` | Margem fecha no p50 e falha no p25, ou alguma entrada está com confiança baixa, ou `V_usd` está na zona de 45 a 60 |
| `descartar` | Correspondência rejeitada, ou margem negativa no p75, ou o prazo do fornecedor estoura o que o modo de suprimento consegue anunciar |

## 10. Prazo e modo de suprimento

Dois fretes e dois relógios.

**Envio direto** (`direct_to_customer`). O AliExpress entrega no comprador. O frete internacional e o imposto são os da oferta. O prazo prometido no Mercado Livre tem de caber em `delivery_days_max` da oferta. O frete de saída do Mercado Livre, nesse modo, é zero porque o vendedor não despacha do Brasil — e o anúncio precisa ser do tipo que admite esse prazo. Se o prazo máximo do fornecedor for maior que o prazo que esse tipo de anúncio sustenta, `lead_time_feasible = false` e a decisão não é comprar nesse modo. O outro modo pode continuar viável.

**Importar e vender com estoque** (`import_then_ml`). O frete internacional é o do lote dividido pelas unidades. O imposto é o do regime daquele cenário. O frete de saída é a cotação do Mercado Livre, com o peso unitário. O prazo do comprador passa a ser o prazo do Mercado Envios (a cotação com CEP de destino devolve a faixa de dias). O prazo do fornecedor vira prazo de reposição, e entra no ciclo de caixa, fora da promessa de entrega.

Guardar, por oferta e por destino:

- `delivery_days_min`, `delivery_days_max` do fornecedor, como a página mostrou
- `ml_delivery_days_min`, `ml_delivery_days_max` para o CEP capital e para o CEP distante
- `lead_time_feasible` por modo

Prazo mediano de categoria no Mercado Livre comparado com o p90 do AliExpress é o gráfico que separa o que dá para anunciar com envio rápido do que só fecha com estoque local.

## 11. Benchmarks

Janela padrão de 28 dias. Grão padrão: categoria do Mercado Livre e, quando houver produto casado, o `product`.

| Métrica | Definição |
| --- | --- |
| Preço p25, p50, p75 | Preço das observações de anúncios novos do produto ou, na visão de categoria, de todos os anúncios da categoria. Moeda BRL. |
| Dispersão | `(p75 − p25) / p50`. Dispersão alta é espaço para posicionar preço; dispersão baixa é commodity. |
| Frete grátis na vitrine | Participação das observações com `free_shipping` verdadeiro, só de fontes que realmente leem o campo (o bloco da home hoje não lê). |
| Presença na vitrine | Dias, nos últimos 28, em que o anúncio apareceu na descoberta, e a posição mediana nesses dias. |
| Pressão promocional | Participação das observações em que `original_price > price`. |
| Estabilidade | Coeficiente de variação do preço diário mediano do produto. |
| Índice de preço da categoria | Média geométrica de `preço_no_dia / preço_no_dia_base` dos anúncios presentes nos dois pontos. Base = primeiro dia de uma janela de 90 dias. Anúncio que entra no meio da janela fica de fora do índice, para um item novo e barato não puxar a série. |
| Velocidade | `(sold_quantity_t − sold_quantity_t−1) / dias`, somente `sold_quantity_kind = exact`, delta ≥ 0 e delta abaixo de um teto de sanidade (acima do teto, a linha vai para quarentena). |
| Composição do preço | Mediana, entre produtos com margem calculada em confiança alta ou oficial, da participação de custo posto, imposto, tarifa, frete de saída e margem sobre o preço p25. |
| Cobertura | Produtos da lista de acompanhamento com correspondência aceita, dividido pelo tamanho da lista. É o número que diz se o funil de dados está pronto para decidir. |
| Retorno sobre capital ao mês | `(margem / desembolso) × (30 / ciclo_dias)`. Desembolso = custo posto + embalagem. Tarifa e frete de saída ficam de fora: saem no acerto da venda. |

Benchmark de margem só entra na média quando `input_confidence` é oficial ou alta. Misturar fallback de 12% com cotação oficial puxa a mediana para um número que nenhum dos dois grupos tem.

## 12. Cenário base

Uma linha em `scenario`, nome `base_prospeccao`.

| Premissa | Valor |
| --- | --- |
| Site | MLB |
| Tipo de anúncio | Clássico, `gold_special` |
| Logística | `drop_off`, modo `me2` |
| Reputação | `green`, sem desconto de MercadoLíder. Um segundo cenário liga o desconto. |
| Destino do ICMS | SP, 17% |
| Regime | `prc_pf` para a prospecção. `formal_import` fica sem número até ter NCM e uma fonte de alíquota. |
| Modos | `direct_to_customer` e `import_then_ml`, os dois calculados |
| Ads | 0. Cenários extras em 5% e 10%. |
| Embalagem | R$ 1,50 até haver custo medido |
| Piso | 25% e R$ 15 |
| Preço de referência | p25 em 28 dias, condição novo, mesma quantidade de unidades |
| Câmbio | PTAX venda do dia da coleta da oferta |
| Origem do frete ML | CEP fixo da operação, guardado no cenário |
| Sem dimensão | Fora do ranking de compra |

Premium, Flex, Full e reputação líder são cenários adicionais sobre o mesmo produto. A tela compara no máximo o base contra um alternativo, para a diferença ter uma causa só.

## 13. Exemplo numérico

Os preços de venda, a tarifa de 12% e os fretes de saída deste exemplo são premissas para mostrar a conta. Eles serão substituídos pela cotação e pelo p25 real. O imposto segue a regra da seção 7. Câmbio do exemplo: R$ 5,40 por dólar. Oferta: US$ 8,00 de mercadoria + US$ 2,00 de frete, seguro zero, imposto ainda não embutido no preço.

Valor aduaneiro US$ 10,00, abaixo de US$ 50, pessoa física, Remessa Conforme. II = 0. Em reais, 10 × 5,40 = R$ 54,00. ICMS = 54 / 0,83 × 0,17 = R$ 11,06. Custo posto = R$ 65,06. Com embalagem, R$ 66,56.

| | Venda no p25 ilustrativo R$ 129,90 | Venda no meio ilustrativo R$ 159,90 |
| --- | ---: | ---: |
| Custo posto + embalagem | 66,56 | 66,56 |
| Tarifa 12% (fallback, preço ≥ R$ 79, custo fixo 0) | 15,59 | 19,19 |
| Frete de saída (premissa até a cotação existir) | 18,00 | 22,00 |
| Margem | 29,75 | 52,15 |
| Margem % | 22,9% | 32,6% |
| Decisão neste cenário | observar | compraria se o p25 real fosse este preço |

O preço mínimo para 25% de margem, com frete de saída de R$ 18 e tarifa de 12%, é (66,56 + 18) / (1 − 0,12 − 0,25) = R$ 134,22. Cai na faixa de R$ 79 ou mais, então a premissa de custo fixo zero se mantém. O p25 de R$ 129,90 fica abaixo desse mínimo: a margem em reais existe, e o piso percentual não fecha.

Ciclo de caixa do mesmo produto, no preço de R$ 159,90. A margem de R$ 52,15 incide sobre R$ 66,56 de desembolso (custo posto mais embalagem), 78% por ciclo. Tarifa e frete de saída ficam de fora dessa base porque saem no acerto da venda:

| Modo | Ciclo | Retorno sobre o desembolso, em 30 dias |
| --- | --- | --- |
| Direto, p90 do fornecedor 25 dias + 14 dias até o repasse | 39 dias | 78% × 30/39 = 60% ao mês sobre o capital da unidade |
| Estoque, 25 dias de reposição + 21 dias de cobertura + 14 dias de repasse | 60 dias | 78% × 30/60 = 39% ao mês sobre o capital da unidade |

Esse retorno ranqueia produto contra produto. Ele assume que a unidade vende. Sem `sold_quantity` estável, o plano não transforma isso em faturamento mensal. Uma participação de mercado (por exemplo 5% da velocidade mediana dos anúncios comparáveis) pode entrar depois, como coluna explícita `assumed_share`, jamais como 100%.

## 14. Projeções

Três projeções, cada uma com o dado que já dá para sustentá-la.

**Preço.** Para produto com pelo menos 14 dias de preço mediano: tendência linear do log do preço, 14 dias à frente, e a variação percentual dos últimos 28 dias. Se o p25 da categoria cair mais de 8% em 28 dias, a mart marca `price_compression` e a margem projetada usa o preço tendenciado no lugar do p25 atual.

**Margem em três cenários nomeados**, reusando a mesma fórmula:

| Cenário | O que muda |
| --- | --- |
| Base | PTAX do dia, p25 atual |
| Câmbio | PTAX + 5%, resto igual |
| Preço | p25 − 10%, câmbio do dia |

A banda não é um intervalo estatístico sofisticado. É a sensibilidade que muda a decisão. Se o base está em comprar e o cenário de câmbio + 5% cai para observar, o produto aparece com essa ressalva, porque US$ 1 de variação perto da faixa de US$ 50 também muda o imposto.

**Caixa.** A métrica da seção 13: margem por real empatado em 30 dias, nos dois modos de suprimento. Estoque de 21 dias é parâmetro do cenário `import_then_ml`, não uma previsão de demanda.

Unidade vendida projetada espera 14 dias de delta `exact` sem quarentena. Antes disso a coluna fica nula e o gráfico de faturamento não renderiza.

## 15. Gráficos

Filtros globais de todos eles: categoria, faixa de preço, cenário (tipo de anúncio, modo de suprimento, regime), confiança da entrada. Fonte no rodapé de cada um: mart, dia do cálculo, versão da regra.

| Gráfico | Marca | Eixos | Leitura |
| --- | --- | --- | --- |
| Funil da coleta | Barras horizontais, uma por etapa | Etapas do dia: descobertos, com peso, com correspondência candidata, aceita, decisão comprar. Unidade: produtos. | Onde o dado ainda não deixa decidir. |
| Composição do preço | Barras empilhadas ou cascata | Um produto selecionado. Componentes em R$: custo posto, embalagem, tarifa, frete de saída, margem. A soma é o preço de referência. | Quanto sobra depois de cada camada. |
| Mapa de oportunidade | Dispersão | Eixo x: preço p25 em R$. Eixo y: custo posto em R$. Um ponto por produto aceito. Linha de margem zero e linha do piso de 25%, desenhadas para a tarifa e o frete medianos do filtro. Cor pela categoria, no máximo oito categorias visíveis; o resto agrupa em “outras”. | Quem está do lado viável da linha do piso. |
| Composição por categoria | Barras empilhadas a 100% | Categorias no eixo. Séries: custo, imposto, tarifa, frete, margem. | Onde a tarifa ou o frete come a categoria inteira. |
| Índice de preço e câmbio | Linhas, 90 dias | Eixo x: data. Eixo y esquerdo: índice da categoria, base 100 no primeiro dia. Eixo y direito: PTAX USD/BRL. | Preço de venda e custo de reposição se mexendo juntos ou não. |
| Distribuição da margem | Histograma | Eixo x: margem % em faixas de 5 pontos. Eixo y: produtos. Linha vertical no piso de 25%. Só confiança alta ou oficial. | O formato do portfólio, fora um único campeão. |
| Prazo | Barras p50 e p90 | Categorias. Série do `delivery_days_max` do fornecedor e série do prazo mediano prometido no Mercado Livre para o CEP capital. | Onde o envio direto estoura a promessa. |
| Ranking | Tabela, com ordenação | Produto, score da correspondência, p25, custo posto, tarifa, frete, margem em R$ e em %, prazo p90, faixa em relação a R$ 79, `near_threshold`, decisão, retorno sobre capital em 30 dias. | A lista de trabalho do dia. |

O mapa de oportunidade e o ranking são a tela principal. Os outros explicam uma linha quando alguém abre o produto.

## 16. Qualidade

- Toda carga tem `run_id`. Página que falhar registra o erro e segue. A observação anterior permanece.
- Preço nulo entra na observação e fica de fora de percentil, índice e margem.
- Variação de preço maior que 40% de um dia para o outro vai para quarentena (`price_jump`) até o título e o `units_per_pack` serem revistos. Kit que virou unidade aparece exatamente assim.
- Delta negativo de `sold_quantity`, ou delta acima do teto, não entra na velocidade.
- Moeda sempre preenchida. Preço do AliExpress em CNY converte por `CNY/BRL` do mesmo dia. Preço já em BRL no checkout brasileiro não converte de novo.
- Teste do imposto com a tabela da seção 7.
- Teste de que `fixed_fee` não é somado quando `sale_fee_amount` já veio preenchido.
- Teste de que `price_includes_tax` zera a segunda aplicação de II e ICMS.
- Correspondência com quantidade ou voltagem divergente não passa de `candidate` por título.
- Cobertura de peso e cobertura de correspondência aceita aparecem no topo da mart, ao lado do ranking. Um ranking de 12 produtos sobre 400 descobertos é um funil curto, e o número fica visível.

## 17. Fases

Cada fase termina com uma consulta que já responde uma pergunta. A fase seguinte não começa para “completar o modelo” com a anterior sem dado.

**Fase 0 — guardar história.** Criar `ingest_run`, `raw_payload` e `listing_observation`. O scraper insere a observação e só depois reescreve `best_sellers`. A tela atual permanece. Pronto quando dois scrapes seguidos deixam a tela no estado novo e a observação do primeiro scrape ainda consultável.

**Fase 1 — completar o anúncio.** Job de acompanhamento com quantidade vendida, frete de verdade, GTIN, peso, tipo de anúncio e catálogo. Lista de acompanhamento definida. Pronto quando a lista tem esses campos preenchidos ou marcados como ausentes de propósito, com `sold_quantity_kind` distinto de número inventado.

**Fase 2 — referências.** PTAX diária. `tax_rule` com a vigência de 12/05/2026 e o teste dos dois exemplos. Cotações de tarifa e de frete, com cache e `fee_source`. Pronto quando um anúncio acima de R$ 79 e um abaixo devolvem tarifa e frete em colunas separadas.

**Fase 3 — fornecedor e correspondência.** Carga CSV do AliExpress na estrutura de `supplier_price`. Ponte `product_match` com os três métodos e a fila de revisão. Pronto quando existe produto com correspondência aceita por GTIN e produto parado em `candidate` por título.

**Fase 4 — margem e gráficos.** `cost_scenario` e `mart_opportunity` no cenário base. Funil, composição, mapa, ranking e prazo. Pronto quando a decisão de um produto bate com a conta feita na mão a partir das colunas, no exemplo da seção 13 e em um item real.

**Fase 5 — projeção e alerta.** Três cenários de sensibilidade, flag de compressão de preço, retorno sobre capital nos dois modos. Pronto quando um produto em comprar no base e em observar no câmbio +5% aparece com as duas linhas.

Fora deste plano, de propósito: nota fiscal, estoque contábil, custo de armazenagem detalhado do Full, previsão estatística de demanda antes de haver velocidade `exact`, e outros países. Ads real entra como cenário de taxa, e a integração com o painel de Product Ads pode esperar a fase 4 estar estável.

## 18. Fontes das regras usadas neste plano

- Tarifas e o cálculo por categoria, preço e logística: documentação de custos por vender do Mercado Livre, atualizada em 3 de setembro de 2026, incluindo a mudança de custo fixo ativada no Brasil em 2 de março de 2026. Endpoint `GET /sites/MLB/listing_prices`.
- Frete pago pelo vendedor: documentação de custos de envio, atualizada em 20 de abril de 2026. Endpoint `GET /users/{user_id}/shipping_options/free`. A tag `mandatory_free_shipping` marca preço acima do limiar em Mercado Envios 2.
- Faixa usual de comissão Clássico 10–14% e Premium 15–19%, e o limiar de R$ 79 sem custo fixo na comunicação a vendedores: central de aprendizagem de tarifas do Mercado Livre e material de envios (frete grátis ao comprador a partir de R$ 19 e a partir de R$ 79, com o vendedor assumindo parte do envio acima de R$ 79). Onde essa comunicação e a API divergirem no valor, vale a resposta da API no dia da cotação.
- Imposto de importação e ICMS de remessa: Receita Federal, tributação de remessas postais e expressas, regra do Programa Remessa Conforme para declarações registradas a partir de 12 de maio de 2026. Até US$ 50, II de 0% para pessoa física em site certificado. Acima, 60% com dedução de US$ 30. ICMS por dentro, 17% a 20% conforme a UF (SP 17%). De 1º de agosto de 2024 a 11 de maio de 2026 a faixa de até US$ 50 tinha II de 20% e a dedução acima do limite era de US$ 20; essa regra fica na tabela de vigência para o histórico, e o cálculo novo usa a linha de maio de 2026.
