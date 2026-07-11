### Requirements
- Node.js v16.3.0 or higher
- NPM v7.15.1 or higher

### Install Node.js and NPM on Ubuntu 18.04 or higher

```bash
$ sudo apt-get update
$ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
$ nvm install 16.3.0
```

### Installing MM-DIRECT_monitoring

```bash
$ git clone https://github.com/ManoelRochadev/MM-DIRECT_monitoring.git
$ cd MM-DIRECT_monitoring
```

Install the dependencies with the following command:
```bash
$ npm install
```

### Configuring MM-DIRECT_monitoring

Modify the **config.json** file and select the location where the MM-DIRECT path is located from the user’s home.

Configuring the config.json File Open the config.json file in a text editor and adjust the value of the key corresponding to the MM-DIRECT path. Make sure to provide the correct path to ensure that monitoring works correctly

```json
{
  "path": "/MM-DIRECT"
}
```

### Running MM-DIRECT_monitoring

Execution Start the application with the following command:
```bash
$ npm start
```

The terminal will display the route to which you can access to interact with the monitoring.

Accessing the Route After starting the application, access the route indicated in the terminal. This can be done by typing the provided address into a web browser. Make sure that the server is running and ready to receive connections.

---

## 🔬 Guia de Consolidação Analítica e Exportação (Etapa 5)

O MM-DIRECT agora opera como uma plataforma de análise científica integrada. Cada experimento (ensaio) concluído gera um conjunto auto-contido de resultados históricos sob a pasta `src/runs/` permitindo análise individual e comparação de cenários.

### 📁 Estrutura de Arquivos de Ensaio
Cada ensaio finalizado cria um diretório `/src/runs/run_<timestamp>/` estruturado da seguinte forma:
- `metadata.json`: Parâmetros de entrada submetidos no setup, modo operacional e data/hora.
- `logs.txt`: Arquivo de logs brutos emitidos pela console do `redis-server`.
- `datasets.csv`: Telemetria de throughput e operações executadas.
- `system_monitoring.csv`: Telemetria de CPU e uso de memória RAM.
- `results.json`: Marcos de falha, inicialização e fim de recuperação calculados no backend.
- `export/report.json`: Sumário executivo contendo médias, picos de CPU/RAM, e vazão agregada.

---

### 🖥️ Fluxo de Uso do Painel de Análise
Ao abrir a aplicação no navegador (`http://localhost:5173` ou conforme exibido pela console do Vite):

1. **Executar Ensaios**:
   - Ajuste as opções no painel de setup (**Indexer**, **Checkpointer**, **Failure**, etc.).
   - Clique em **START** para iniciar o monitoramento em tempo real. Os WebSockets transmitirão os dados dinamicamente.
   - Execute a falha e aguarde a estabilização completa. Ao encerrar o experimento (via botão **Reload/Voltar** ou `/stop`), o servidor salvará o ensaio concluído automaticamente.

2. **Análise Individual**:
   - Mude para a aba **Histórico & Comparação** no menu superior.
   - Selecione qualquer rodada na barra lateral. A interface renderizará a cronologia dos eventos e tabelas de parâmetros científicos.
   - Clique em **Exportar JSON** para efetuar o download direto do `report.json`.
   - Clique em **Imprimir PDF** para gerar um relatório científico diagramado sob regras rígidas de diagramação acadêmica (estilo IEEE/ACM) direto para salvar em PDF no seu sistema operacional.

3. **Comparador de Cenários (Tradicional vs MM-DIRECT)**:
   - Na lista lateral de rodadas, marque a caixa **Comparar A** em uma rodada e **Comparar B** em outra.
   - O dashboard renderizará um gráfico sobreposto de throughput das duas execuções em tempo real, uma tabela analítica contrastando pico de CPU, consumo de RAM, e calculará o **Speedup de Recuperação** obtido pela Árvore Indexada MM-DIRECT em relação ao Log Sequencial AOF.

