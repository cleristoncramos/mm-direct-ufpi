# MM-DIRECT: Banco de Dados em Memória com Recuperação Instantânea

## Visão Geral

O MM-DIRECT é uma extensão experimental de banco de dados em memória baseada no ecossistema Redis, cujo foco reside na otimização e validação científica do mecanismo de recuperação instantânea após falhas. Diferente dos métodos de persistência tradicionais, que exigem o carregamento completo do log de operações (AOF) antes de liberar o banco de dados para novas conexões, o MM-DIRECT emprega uma estrutura de indexação paralela baseada em árvore (B-Tree) implementada com suporte a Berkeley DB. Esta abordagem permite que a instância do banco de dados volte a aceitar conexões e processar novas transações quase que imediatamente após a inicialização, enquanto a recuperação das tuplas remanescentes ocorre de forma incremental e sob demanda em segundo plano.

O projeto integra um backend de controle e telemetria acoplado a um frontend interativo para permitir a instrumentação científica, simulação controlada de ciclos de falha e recuperação, medição de métricas de uso de recursos e comparação analítica de cenários experimentais.

## Objetivo Científico

O principal propósito científico do MM-DIRECT é avaliar e contrastar o desempenho temporal de esquemas de recuperação instantânea contra abordagens tradicionais de restauração sequencial (AOF/RDB). O sistema serve de plataforma para a pesquisa de modelos de consistência híbrida, mensurando o tempo necessário para o restabelecimento da estabilidade transacional, a taxa de vazão (throughput) durante a fase de degradação por falha e a sobrecarga imposta sobre a CPU e a memória RAM devido ao indexador concorrente.

A reprodutibilidade é tratada como pilar central, fornecendo ferramentas padronizadas para capturar dados finos de latência física e speedup em microsegundos do sistema, eliminando flutuações e viabilizando a validação de hipóteses de pesquisa sobre sistemas de banco de dados não voláteis (NVM) e recuperação instantânea.

## Principais Funcionalidades

* Execução manual e controlada do ciclo de vida do experimento (inicialização, aplicação de carga sintética, simulação de queda abrupta e recuperação incremental).
* Dashboard analítico em tempo real com gráfico principal de vazão (Throughput) e gráficos auxiliares síncronos de consumo de CPU, consumo de memória RAM e latência das operações em nível de microsegundos.
* Marcação automatizada de marcos temporais: tempo até a falha, início da recuperação física do indexador, fim do carregamento do banco de dados e retorno do sistema à estabilidade operacional.
* Persistência histórica dos ensaios em estruturas cronológicas identificadas por carimbo de data/hora (timestamps).
* Módulo comparador de rodadas para contraste visual de curvas de vazão, análise de speedup de recuperação e sobreposição gráfica de múltiplos cenários.
* Exportação de dados consolidados do ensaio em formatos padronizados (JSON) e emissão de relatórios científicos em formato PDF seguindo formatação acadêmica.

## Arquitetura Geral do Sistema

A arquitetura do MM-DIRECT baseia-se em um modelo integrado de três camadas, operando inteiramente em ambiente local para mitigar latências de rede nas medições:

1. **Camada de Banco de Dados (Redis-IR):** Núcleo escrito em C que implementa a lógica do motor de banco de dados em memória, a indexação B-Tree com Berkeley DB e a lógica de recuperação incremental (on-demand e incremental loading threads).
2. **Camada de Controle e Telemetria (Backend):** Servidor local desenvolvido em Node.js responsável por gerenciar a configuração dinâmica do Redis (`redis_ir.conf`), controlar o processo do servidor via chamadas de sistema, processar arquivos de logs e telemetria (CSV), e transmitir os dados para a interface via conexões estáveis de WebSockets.
3. **Camada de Apresentação (Frontend):** Dashboard desenvolvido em React, TypeScript e Tailwind CSS, que consome as transmissões do backend via WebSockets para desenhar os gráficos em tempo real utilizando componentes locais baseados em Chart.js, permitindo a operação do ensaio e a exportação dos artefatos.

## Tecnologias Utilizadas

* **Motor de Banco de Dados:** C (base de código Redis-IR), Berkeley DB (libdb-dev)
* **Backend de Controle:** Node.js, Express, WS (WebSockets), Tail (monitoramento de arquivos de log)
* **Frontend Analítico:** React, TypeScript, Vite, Tailwind CSS, Chart.js, React-Chartjs-2
* **Ambiente de Validação:** Ubuntu Linux (foco em distribuições baseadas em Debian)

## Estrutura do Repositório

```
.
├── config-mm-direct.js         # Módulo de parametrização do arquivo de configuração do Redis
├── package.json                # Gerenciamento de scripts e dependências do backend
├── redis.conf                  # Configuração base padrão do Redis
├── redis_ir.conf               # Configuração ativa modificada pelo painel de setup
├── server.js                   # Servidor backend de controle e streaming de dados
├── src                         # Código-fonte do banco de dados MM-DIRECT (C)
│   ├── Makefile                # Diretivas de compilação da base do Redis
│   ├── instant_recovery.c      # Mecanismo principal de recuperação e threads do restorer
│   ├── datasets                # Diretório temporário do pipeline de telemetria
│   │   └── datasets.csv        # Telemetria padronizada de comandos e tempos
│   ├── system_monitoring       # Diretório de telemetria de recursos
│   │   └── system_monitoring.csv # Uso de CPU e RAM coletado do sistema operacional
│   └── runs                    # Persistência histórica dos ensaios realizados
│       └── run_<timestamp>     # Diretório individual de um ensaio específico
│           ├── datasets.csv    # Cópia da telemetria de throughput do ensaio
│           ├── logs.txt        # Logs de console capturados do redis-server
│           ├── metadata.json   # Parâmetros experimentais submetidos no setup
│           ├── results.json    # Marcos analíticos identificados no ensaio
│           ├── system_monitoring.csv # Telemetria de CPU e RAM do ensaio
│           └── export
│               └── report.json # Consolidado estruturado para exportação científica
└── web                         # Código-fonte da aplicação frontend (React)
    ├── package.json            # Dependências e scripts do painel de controle
    ├── src                     # Componentes e views da interface gráfica
    └── vite.config.ts          # Arquivo de configuração de empacotamento do Vite
```

## Pré-requisitos

Para preparar o ambiente de execução no Ubuntu Linux, instale as dependências de compilação e as bibliotecas de desenvolvimento de banco de dados necessárias:

```bash
sudo apt-get update
sudo apt-get install build-essential libdb-dev nodejs npm
```

*Nota: Certifique-se de que o gerenciador de pacotes do Node.js (npm) e o Node.js correspondam a versões de suporte de longo prazo estáveis (LTS).*

## Como Executar no Ubuntu

### Passo 1: Compilação do Banco de Dados (Redis-IR)

Compile os binários do Redis-IR na pasta raiz do projeto usando as diretivas do Makefile:

```bash
make
```

Para compilar apenas os binários específicos do servidor na subpasta `src`:

```bash
cd src
make redis-server
cd ..
```

### Passo 2: Inicialização do Backend de Controle

Instale as dependências do Node.js a partir da raiz do projeto e inicie o servidor de controle:

```bash
npm install
npm start
```

*Nota: O script de inicialização do backend finaliza processos órfãos nas portas de controle de forma síncrona antes de liberar a execução do servidor.*

### Passo 3: Inicialização da Interface Analítica (Frontend)

Abra outro terminal, navegue até a pasta do frontend, instale as dependências e inicie o servidor de desenvolvimento do Vite:

```bash
cd web
npm install
npm run dev
```

Acesse o endereço da aplicação exibido no console (geralmente `http://localhost:5173`) no navegador de sua preferência.

## Fluxo de Uso do Experimento

A instrumentação científica de um ensaio obedece a um fluxo manual sequencial:

1. **Configuração de Parâmetros (Setup):** Na tela inicial do painel de controle, ajuste as abas de parâmetros experimentais (Indexer, Checkpointer, Failure, Memtier, etc.) de acordo com a meta da rodada de testes.
2. **Inicialização do Ensaio:** Clique no botão **START** para gravar a configuração no `redis_ir.conf` e disparar a execução do servidor `redis-server`. Os WebSockets de monitoramento abrirão conexões ativas.
3. **Fase Pré-Falha (Carga):** A telemetria iniciará o monitoramento da vazão da carga aplicada pelo `memtier_benchmark` (se configurado como ON) no gráfico de Throughput, além do consumo de CPU e memória RAM. O status indicará "Executando Carga".
4. **Fase de Falha:** O sistema aplicará a falha física simulada (desligamento forçado controlado). O status mudará para "Falha Simulada" e a curva do Throughput sofrerá queda abrupta até zero.
5. **Fase de Recuperação:** O servidor é reiniciado automaticamente para restaurar o estado estável. O status mudará para "Recuperando (X%)". O acompanhamento percentual e a barra de progresso do restorer atualizarão na tela de segundo em segundo com base nos registros lidos pelo indexador no Berkeley DB.
6. **Estabilização:** Após a conclusão total do carregamento pelo indexador, o status transiciona para "Estável". O Throughput de gravação/leitura será plenamente restabelecido e a telemetria será mantida até a finalização da execução.
7. **Finalização do Experimento:** Clique no botão **RETURN** na barra de navegação. A aplicação enviará um comando de desligamento ordenado ao Redis (`redis-cli shutdown`), fechará os WebSockets e consolidará os resultados salvando os relatórios de forma ordenada na estrutura de pastas físicas de ensaio (`runs`).

## Parâmetros Experimentais

O comportamento do MM-DIRECT é governado por parâmetros organizados nas seguintes seções de setup:

* **Indexer:** Ativação/Desativação da recuperação instantânea (Instant Recovery), execução síncrona/assíncrona e ajuste da taxa de intervalo de indexação (Time interval).
* **Checkpointer:** Configuração da frequência e limites de persistência em checkpoints físicos no disco para limitar o tempo de restauração do log.
* **Failure:** Definição da simulação de falha controlada, tempo de atraso de reinicialização (restartAfterTime) e parâmetros de pré-carregamento.
* **Memtier:** Ativação da carga sintética e passagem de parâmetros do utilitário benchmark (chaves máximas, proporção de comandos e padrões de chave).
* **System Monitoring:** Frequência de varredura do sistema operacional para acompanhamento de taxas físicas de uso de RAM e CPU.

## Arquivos Gerados por Ensaio

Ao encerrar cada rodada, o backend de controle cria um diretório autossuficiente em `src/runs/run_<timestamp>/` contendo os seguintes arquivos estruturados:

| Arquivo | Formato | Descrição |
| :--- | :--- | :--- |
| `metadata.json` | JSON | Registro dos parâmetros submetidos nas abas de configuração e modo de recuperação. |
| `logs.txt` | Texto Plano | Cópia fiel da saída padrão (stdout/stderr) capturada do processo do `redis-server`. |
| `datasets.csv` | CSV | Registro de carimbos de término e contagem das operações do benchmark executadas ao longo do tempo. |
| `system_monitoring.csv` | CSV | Telemetria contendo carimbo de tempo, percentual de CPU e consumo de memória RAM do processo. |
| `results.json` | JSON | Sumário contendo marcos temporais relativos de falha, início de recuperação, fim de recuperação e estabilidade. |
| `export/report.json` | JSON | Consolidação analítica final com tempos de recuperação absoluto, picos de CPU, pico de RAM e vazão média de transações. |

## Histórico, Comparação e Relatórios

Na aba **Histórico & Comparação** é possível gerenciar a base de dados científicos de rodadas anteriores:

* **Controle de Rodadas:** Exibição cronológica de ensaios salvos com opção de visualização detalhada de metadados experimentais.
* **Comparação Cruzada (A vs B):** Seleção de dois cenários específicos (ex: uma rodada usando recuperação instantânea MM-DIRECT vs outra em recuperação convencional AOF). O sistema plota as curvas de Throughput sobrepostas de ambos os cenários no mesmo gráfico, calcula o speedup absoluto do tempo de restabelecimento transacional e exibe uma tabela comparativa com médias de uso de recursos físicos.
* **Consolidação de Artefatos:** Acesso rápido ao histórico de relatórios formatados.

## Exportação de Resultados

A exportação de dados científicos pode ser feita na barra superior do Workbench:

* **Exportar JSON:** Download direto do arquivo consolidado de resultados estruturados (`report.json`) do ensaio ativo.
* **Exportar PDF:** Emissão de relatório científico diagramado sob regras estritas de design acadêmico (estilo IEEE/ACM) contendo metadados completos, tabela detalhada de parâmetros e os gráficos de Throughput, CPU e RAM em alta definição.

## Observações sobre Reprodutibilidade

Para garantir a confiabilidade acadêmica dos experimentos, o MM-DIRECT obedece às seguintes regras operacionais:

* O backend executa uma limpeza e higienização física rigorosa do pipeline (`rm -f sequentialLog.aof` e reinicialização de portas TCP) antes de cada rodada para evitar poluição ou reaproveitamento de dados residuais entre execuções.
* As escalas de tempo e marcos temporais são calculados no backend tomando como base cronômetros do sistema de alta resolução em microsegundos (`ustime()`), minimizando distorções introduzidas por latência de interface.
* Os dados brutos salvos na pasta individual do ensaio são gravados de forma imutável assim que o experimento se encerra, servindo como registro auditável das execuções.

## Limitações Conhecidas

* O ambiente experimental de controle e medição de telemetria é otimizado para sistemas operacionais baseados em Unix (Ubuntu Linux), dependendo de chamadas nativas do kernel para amostragem física de processos e fuser de rede.
* O processo do Redis necessita de privilégios elevados para a correta inicialização em portas locais controladas caso processos residuais não sejam terminados.

## Próximos Passos

* Integração de suporte a novos benchmarks sintéticos além do memtier_benchmark (ex: YCSB - Yahoo! Cloud Serving Benchmark).
* Implementação de rotinas automáticas de clusterização experimental para instrumentação de múltiplos nós replicados com recuperação concorrente.

## Contexto Acadêmico

O MM-DIRECT foi concebido e implementado como ferramenta de instrumentação e coleta de dados científicos para pesquisas científicas na área de Computação de Alto Desempenho e Bancos de Dados em Memória no âmbito da Universidade Federal do Piauí (UFPI).
