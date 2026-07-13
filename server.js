import express from "express";
import fs from 'fs';
import csv from 'csv-parser';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from "path";
import { Tail } from "tail";
import child_process from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';
import { modifyConfigFile } from "./config-mm-direct.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getTimestamps = (dateInput) => {
  const date = dateInput || new Date();
  const utc = date.toISOString();
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const p = {};
  parts.forEach(part => p[part.type] = part.value);
  
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    timeZoneName: 'longOffset'
  }).formatToParts(date);
  const nameVal = tzParts.find(pt => pt.type === 'timeZoneName')?.value || 'GMT-03:00';
  
  let offsetStr = '-03:00';
  if (nameVal === 'GMT') {
    offsetStr = '+00:00';
  } else {
    const match = nameVal.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (match) {
      const sign = match[1];
      const hours = match[2].padStart(2, '0');
      const minutes = (match[3] || '00').padStart(2, '0');
      offsetStr = `${sign}${hours}:${minutes}`;
    }
  }
  
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  const local = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${ms}${offsetStr}`;
  
  return { utc, local };
};

const app = express();
app.use(cors({
  origin: '*'
}));

const port = 8081;

// start react app
const reactApp = path.join(__dirname, './web');

// listar diretórios do react app
const directories = fs.readdirSync(reactApp)
// se não existir node_modules, instalar as dependências
if (!directories.includes('node_modules')) {
  child_process.execSync('npm install', {
    cwd: reactApp
  })
  child_process.execSync('npm install', {
    cwd: reactApp
  })
}

const reactProcess = child_process.spawn('npm', ['run', 'dev'], {
  cwd: reactApp,
})

reactProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);
});

const rootPath = __dirname;

// Caminhos dos arquivos a serem processados
const inputPath = path.join(rootPath, "src/datasets/datasets.csv");
const pathCpu = path.join(rootPath, "src/system_monitoring/system_monitoring.csv");

// Monitor de arquivos resiliente com tolerância a exclusão, recriação e truncamento
const setupTailWatcher = (filePath, onLineCallback) => {
  let tailInstance = null;
  let retryTimeout = null;
  let isClosed = false;

  const startTailing = () => {
    if (isClosed) return;

    if (!fs.existsSync(filePath)) {
      scheduleRetry();
      return;
    }

    try {
      tailInstance = new Tail(filePath, { follow: true });

      tailInstance.on("line", (data) => {
        if (!isClosed) {
          onLineCallback(data);
        }
      });

      tailInstance.on("error", (error) => {
        cleanupTail();
        scheduleRetry();
      });
    } catch (err) {
      cleanupTail();
      scheduleRetry();
    }
  };

  const cleanupTail = () => {
    if (tailInstance) {
      try {
        tailInstance.unwatch();
      } catch (e) {
        // ignore
      }
      tailInstance = null;
    }
  };

  const scheduleRetry = () => {
    if (isClosed || retryTimeout) return;
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      if (fs.existsSync(filePath)) {
        startTailing();
      } else {
        scheduleRetry();
      }
    }, 500); // Tenta reconectar a cada 500ms
  };

  startTailing();

  return {
    close: () => {
      isClosed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
      cleanupTail();
    }
  };
};

// Rotina síncrona de higienização do pipeline antes de novos experimentos
const sanitizePipeline = () => {
  console.log("Iniciando higienização do pipeline (sanitizePipeline)...");

  // a) Derrubar processos remanescentes/zumbis nas portas críticas (6379)
  try {
    child_process.execSync("fuser -k 6379/tcp", { stdio: "ignore" });
    console.log("Processos remanescentes na porta 6379 (Redis) derrubados.");
  } catch (e) {
    // ignorar se a porta já estiver livre
  }

  // Derrubar processos remanescentes na porta 8081 (preservando o processo atual do Node)
  try {
    const ourPid = process.pid.toString();
    const stdout = child_process.execSync("lsof -t -i tcp:8081 -sTCP:LISTEN").toString().trim();
    if (stdout) {
      const pids = stdout.split("\n")
        .map(p => p.trim())
        .filter(p => p && p !== ourPid);
      for (const pid of pids) {
        console.log(`Derrubando processo zumbi na porta 8081 com PID: ${pid}`);
        child_process.execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      }
    }
  } catch (e) {
    // ignorar
  }

  // b) Remover fisicamente os resíduos e espelhos de logs de execuções anteriores
  const logFile = path.join(rootPath, "src/logs/sequentialLog.aof");
  try {
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
      console.log(`Arquivo de log anterior removido: ${logFile}`);
    }
  } catch (e) {
    console.error(`Erro ao remover arquivo de log: ${e.message}`);
  }

  // c) Garantir a criação das pastas e instanciar um arquivo de dataset totalmente limpo
  const datasetDir = path.join(rootPath, "src/datasets");
  const datasetFile = path.join(datasetDir, "datasets.csv");
  try {
    if (!fs.existsSync(datasetDir)) {
      fs.mkdirSync(datasetDir, { recursive: true });
    }
    fs.writeFileSync(datasetFile, "");
    console.log(`Dataset limpo e instanciado em: ${datasetFile}`);
  } catch (e) {
    console.error(`Erro ao criar dataset limpo: ${e.message}`);
  }

  // Garantir a limpeza/criação do arquivo de monitoramento do sistema
  const monitoringDir = path.join(rootPath, "src/system_monitoring");
  const monitoringFile = path.join(monitoringDir, "system_monitoring.csv");
  try {
    if (!fs.existsSync(monitoringDir)) {
      fs.mkdirSync(monitoringDir, { recursive: true });
    }
    fs.writeFileSync(monitoringFile, "");
    console.log(`Monitoramento limpo e instanciado em: ${monitoringFile}`);
  } catch (e) {
    console.error(`Erro ao criar monitoramento limpo: ${e.message}`);
  }
};

// Variáveis de controle
let lendoArquivo = false; // Variável de controle para verificar se o arquivo está sendo lido

let activeConfig = {};
let currentRunId = null;
let currentRunDir = null;
let currentRunLogs = [];

const finalizeRunResults = () => {
  if (!currentRunDir) return;
  console.log(`Finalizando resultados do ensaio: ${currentRunId}`);

  // 1. Copia arquivos CSV se existirem
  const datasetsSrc = path.join(rootPath, "src", activeConfig.executedCommandsCsvFilename || "datasets/datasets.csv");
  const datasetsDest = path.join(currentRunDir, "datasets.csv");
  try {
    if (fs.existsSync(datasetsSrc)) {
      fs.copyFileSync(datasetsSrc, datasetsDest);
      console.log(`CSV de comandos copiado para: ${datasetsDest}`);
    }
  } catch (e) {
    console.error(`Erro ao copiar datasets.csv para o ensaio ${currentRunId}:`, e.message);
  }

  const monitoringSrc = path.join(rootPath, "src", activeConfig.systemMonitoringCsvFilename || "system_monitoring/system_monitoring.csv");
  const monitoringDest = path.join(currentRunDir, "system_monitoring.csv");
  try {
    if (fs.existsSync(monitoringSrc)) {
      fs.copyFileSync(monitoringSrc, monitoringDest);
      console.log(`CSV de monitoramento copiado para: ${monitoringDest}`);
    }
  } catch (e) {
    console.error(`Erro ao copiar system_monitoring.csv para o ensaio ${currentRunId}:`, e.message);
  }

  // 2. Analisa logs para identificar marcos de falha/recuperação e metadados científicos
  let failureTimes = { utc: null, local: null };
  let recoveryStartTimes = { utc: null, local: null };
  let recoveryEndTimes = { utc: null, local: null };
  let stabilityTimes = { utc: null, local: null };
  let recoveryDuration = null;

  let recoveredTuples = null;
  let incrementalTuples = null;
  let onDemandTuples = null;
  let recordsProcessed = null;
  let inconsistencies = null;
  let recoveryOperationNature = null;

  const fullLogs = currentRunLogs.join("\n");
  const logLines = fullLogs.split("\n");

  logLines.forEach((log) => {
    const text = log.toLowerCase();
    const redisTimeRegex = /^\d+:[M|S|C]\s+([\d\s\w\:\.]+)\s+[\*\#\-]/;
    const matchTime = log.match(redisTimeRegex);
    
    let dateObj = new Date();
    if (matchTime) {
      const parsed = Date.parse(matchTime[1] + " GMT-0300");
      if (!isNaN(parsed)) {
        dateObj = new Date(parsed);
      }
    }
    const times = getTimestamps(dateObj);

    if (text.includes("loading the database from")) {
      recoveryStartTimes = times;
      if (text.includes("indexed log")) {
        recoveryOperationNature = "Recuperação via MM-DIRECT (B-Tree)";
      } else if (text.includes("aof") || text.includes("append only file") || text.includes("sequential log")) {
        recoveryOperationNature = "Recuperação Tradicional (AOF)";
      }
    } else if (text.includes("user requested shutdown") || text.includes("redis is now ready to exit")) {
      failureTimes = times;
    } else if (text.includes("db loaded from indexed log") || text.includes("db loaded from aof") || text.includes("db loaded from append only file")) {
      recoveryEndTimes = times;
      const match = log.match(/loaded from (Indexed Log|AOF):\s*([\d\.]+)\s*seconds/i);
      if (match) {
        recoveryDuration = parseFloat(match[2]);
      } else {
        const matchDisk = log.match(/loaded from disk:\s*([\d\.]+)\s*seconds/i);
        if (matchDisk) recoveryDuration = parseFloat(matchDisk[1]);
        const matchAof = log.match(/loaded from append only file:\s*([\d\.]+)\s*seconds/i);
        if (matchAof) recoveryDuration = parseFloat(matchAof[1]);
      }

      if (text.includes("indexed log")) {
        recoveryOperationNature = "Recuperação via MM-DIRECT (B-Tree)";
      } else {
        recoveryOperationNature = "Recuperação Tradicional (AOF)";
      }

      const tuplesMatch = log.match(/number of tuples loaded into memory:\s*(\d+)/i);
      if (tuplesMatch) {
        recoveredTuples = parseInt(tuplesMatch[1]);
      }
      const incrMatch = log.match(/inclementally\s*=\s*(\d+)/i);
      if (incrMatch) {
        incrementalTuples = parseInt(incrMatch[1]);
      }
      const onDemandMatch = log.match(/on-demand\s*=\s*(\d+)/i);
      if (onDemandMatch) {
        onDemandTuples = parseInt(onDemandMatch[1]);
      }
      const recordsMatch = log.match(/number of records processed:\s*(\d+)/i);
      if (recordsMatch) {
        recordsProcessed = parseInt(recordsMatch[1]);
      } else {
        const aofRecordsMatch = log.match(/records processed from sequential log\s*=\s*(\d+)/i);
        if (aofRecordsMatch) {
          recordsProcessed = parseInt(aofRecordsMatch[1]);
        }
      }
      const inconsistenciesMatch = log.match(/inconsistenes:\s*(\d+)/i);
      if (inconsistenciesMatch) {
        inconsistencies = parseInt(inconsistenciesMatch[1]);
      }
    } else if (text.includes("ready to accept connections")) {
      stabilityTimes = times;
    }
  });

  if (!recoveryOperationNature) {
    recoveryOperationNature = (activeConfig.instantRecoveryState || "ON").toUpperCase() === "ON" ? "Recuperação via MM-DIRECT (B-Tree)" : "Recuperação Tradicional (AOF)";
  }

  // Medição de tamanhos físicos dos arquivos de banco
  let aofSizeBytes = null;
  let indexedLogSizeBytes = null;
  const aofPath = path.join(rootPath, "src", activeConfig.aofFilename || "logs/sequentialLog.aof");
  const indexedLogPath = path.join(rootPath, "src", activeConfig.indexedlogFilename || "logs/indexedLog.db");

  try {
    if (fs.existsSync(aofPath)) {
      aofSizeBytes = fs.statSync(aofPath).size;
    }
  } catch (err) {
    console.error("Erro ao ler tamanho do AOF:", err.message);
  }

  try {
    if (fs.existsSync(indexedLogPath)) {
      indexedLogSizeBytes = fs.statSync(indexedLogPath).size;
    }
  } catch (err) {
    console.error("Erro ao ler tamanho do Indexed Log DB:", err.message);
  }

  // Calcula duração baseada exclusivamente nos marcos UTC
  if (recoveryStartTimes.utc && recoveryEndTimes.utc) {
    const startMs = Date.parse(recoveryStartTimes.utc);
    const endMs = Date.parse(recoveryEndTimes.utc);
    if (!isNaN(startMs) && !isNaN(endMs) && isFinite(startMs) && isFinite(endMs)) {
      recoveryDuration = parseFloat(((endMs - startMs) / 1000).toFixed(3));
    }
  }

  const results = {
    id: currentRunId,
    timestamp: getTimestamps().utc,
    timestampLocal: getTimestamps().local,
    timezone: "America/Sao_Paulo",
    milestones: {
      failureAtUtc: failureTimes.utc,
      failureAtLocal: failureTimes.local,
      recoveryStartAtUtc: recoveryStartTimes.utc,
      recoveryStartAtLocal: recoveryStartTimes.local,
      recoveryEndAtUtc: recoveryEndTimes.utc,
      recoveryEndAtLocal: recoveryEndTimes.local,
      stabilityAtUtc: stabilityTimes.utc,
      stabilityAtLocal: stabilityTimes.local
    },
    recoveryDurationSeconds: recoveryDuration,
    status: stabilityTimes.utc ? "Estável" : "Interrompido",
    recoveredTuples,
    incrementalTuples,
    onDemandTuples,
    recordsProcessed,
    inconsistencies,
    recoveryOperationNature,
    aofSizeBytes,
    indexedLogSizeBytes
  };

  try {
    fs.writeFileSync(path.join(currentRunDir, "results.json"), JSON.stringify(results, null, 2));
    console.log("Arquivo results.json gerado com sucesso!");
  } catch (err) {
    console.error("Erro ao gravar results.json:", err.message);
  }

  // 3. Calcula as métricas científicas consolidadas para o report.json
  let peakThroughput = 0;
  let averageThroughput = 0;
  let totalCommands = 0;

  if (fs.existsSync(datasetsDest)) {
    try {
      const fileContent = fs.readFileSync(datasetsDest, "utf-8");
      const lines = fileContent.split("\n");
      let dbStartup = 0;
      let lineCount = 0;
      const contagem = {};

      lines.forEach((lineText) => {
        const row = lineText.split(",");
        if (row.length < 5) return;
        lineCount++;
        if (lineCount === 2) {
          dbStartup = parseInt(row[2]) || parseInt(row[1]);
        } else if (lineCount > 2) {
          if (row[0] !== '0' && !isNaN(parseInt(row[2]))) {
            totalCommands++;
            const finishTime = parseInt(row[2]);
            const sec = Math.floor((finishTime - dbStartup) / 1000000);
            if (sec >= 0) {
              contagem[sec] = (contagem[sec] || 0) + 1;
            }
          }
        }
      });

      const counts = Object.values(contagem);
      if (counts.length > 0) {
        peakThroughput = Math.max(...counts);
        const sum = counts.reduce((acc, curr) => acc + curr, 0);
        averageThroughput = parseFloat((sum / counts.length).toFixed(2));
      }
    } catch (e) {
      console.error("Erro ao computar sumário de throughput:", e.message);
    }
  }

  let peakCpu = 0;
  let averageCpu = 0;
  let peakMemory = 0;
  let averageMemory = 0;

  if (fs.existsSync(monitoringDest)) {
    try {
      const fileContent = fs.readFileSync(monitoringDest, "utf-8");
      const lines = fileContent.split("\n");
      const cpus = [];
      const mems = [];

      lines.forEach((lineText) => {
        const row = lineText.split(";");
        if (row.length < 3) return;
        if (row[0].match(/^\d+$/)) {
          cpus.push(parseFloat(row[1]));
          mems.push(parseFloat(row[2]));
        }
      });

      if (cpus.length > 0) {
        peakCpu = Math.max(...cpus);
        const sumCpu = cpus.reduce((acc, curr) => acc + curr, 0);
        averageCpu = parseFloat((sumCpu / cpus.length).toFixed(2));
      }
      if (mems.length > 0) {
        const memsMb = mems.map(m => m / 1024);
        peakMemory = Math.max(...memsMb);
        const sumMem = memsMb.reduce((acc, curr) => acc + curr, 0);
        averageMemory = parseFloat((sumMem / memsMb.length).toFixed(2));
      }
    } catch (e) {
      console.error("Erro ao computar sumário de CPU/Memória:", e.message);
    }
  }

  // 4. Grava report.json no diretório export/
  const exportDir = path.join(currentRunDir, "export");
  try {
    fs.mkdirSync(exportDir, { recursive: true });
  } catch (e) {}

  const metadataPath = path.join(currentRunDir, "metadata.json");
  let startedAtUtc = getTimestamps().utc;
  let startedAtLocal = getTimestamps().local;
  if (fs.existsSync(metadataPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      startedAtUtc = meta.timestamp;
      startedAtLocal = meta.timestampLocal || getTimestamps(new Date(meta.timestamp)).local;
    } catch (e) {}
  }

  const report = {
    runId: currentRunId,
    mode: (activeConfig.instantRecoveryState || "ON").toUpperCase() === "ON" ? "MM-DIRECT (B-Tree)" : "Tradicional (AOF)",
    timezone: "America/Sao_Paulo",
    startedAtUtc,
    startedAtLocal,
    failureAtUtc: failureTimes.utc,
    failureAtLocal: failureTimes.local,
    recoveryStartAtUtc: recoveryStartTimes.utc,
    recoveryStartAtLocal: recoveryStartTimes.local,
    recoveryEndAtUtc: recoveryEndTimes.utc,
    recoveryEndAtLocal: recoveryEndTimes.local,
    stabilityAtUtc: stabilityTimes.utc,
    stabilityAtLocal: stabilityTimes.local,
    recoveryDurationSeconds: recoveryDuration,
    status: stabilityTimes.utc ? "Estável" : "Interrompido",
    config: activeConfig,
    throughputSummary: {
      peakThroughput,
      averageThroughput,
      totalCommands
    },
    cpuSummary: {
      peakCpu,
      averageCpu
    },
    memorySummary: {
      peakMemory,
      averageMemory
    },
    recoveredTuples,
    incrementalTuples,
    onDemandTuples,
    recordsProcessed,
    inconsistencies,
    recoveryOperationNature,
    aofSizeBytes,
    indexedLogSizeBytes
  };

  try {
    fs.writeFileSync(path.join(exportDir, "report.json"), JSON.stringify(report, null, 2));
    console.log("Relatório export/report.json gerado com sucesso!");
  } catch (err) {
    console.error("Erro ao gravar report.json:", err.message);
  }

  // Reset referências
  currentRunId = null;
  currentRunDir = null;
  currentRunLogs = [];
};

const server = app.listen(port, () => {
  console.log(`rota para configuração do arquivo redis_ir.conf: http://localhost:${port}/config`);
});

// Criar um servidor WebSocket
const wss = new WebSocketServer({ server }, () => {
  console.log(`
  rota para o dataset de comandos por segundo: ws://localhost:8080/data
  rota para o dataset de uso de cpu: ws://localhost:8080/cpu
  `);
});

// rota para configurar o arquivo de configuração do MM-DIRECT
app.post('/config', express.json(), (req, res) => {
  const config = req.body;
  activeConfig = config; // Salva configuração ativa
  modifyConfigFile(config, rootPath);
  res.json(config);
});

// Rota para listar ensaios concluidos
app.get('/api/runs', (req, res) => {
  const runsDir = path.join(rootPath, "src/runs");
  if (!fs.existsSync(runsDir)) {
    return res.json([]);
  }
  try {
    const folders = fs.readdirSync(runsDir);
    const runs = [];
    folders.forEach((folder) => {
      const runPath = path.join(runsDir, folder);
      if (fs.statSync(runPath).isDirectory()) {
        const metadataPath = path.join(runPath, "metadata.json");
        const resultsPath = path.join(runPath, "results.json");
        const reportPath = path.join(runPath, "export/report.json");
        
        let metadata = null;
        let results = null;
        let report = null;
        
        if (fs.existsSync(metadataPath)) {
          metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
        }
        if (fs.existsSync(resultsPath)) {
          results = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
        }
        if (fs.existsSync(reportPath)) {
          report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
        }
        
        runs.push({
          id: folder,
          metadata,
          results,
          report
        });
      }
    });
    runs.sort((a, b) => b.id.localeCompare(a.id));
    res.json(runs);
  } catch (err) {
    console.error("Erro ao listar ensaios:", err);
    res.status(500).json({ error: "Erro ao listar ensaios" });
  }
});

// Rota para ler a telemetria historica de um ensaio
app.get('/api/runs/:runId/telemetry', (req, res) => {
  const { runId } = req.params;
  const datasetsPath = path.join(rootPath, "src/runs", runId, "datasets.csv");
  const monitoringPath = path.join(rootPath, "src/runs", runId, "system_monitoring.csv");
  
  const telemetry = {
    throughput: [],
    monitoring: []
  };
  
  if (fs.existsSync(datasetsPath)) {
    try {
      const fileContent = fs.readFileSync(datasetsPath, "utf-8");
      const lines = fileContent.split("\n");
      let totalLines = 0;
      let dbStartupTime = 0;
      const contagem = {};
      
      lines.forEach((lineText) => {
        const row = lineText.split(",");
        if (row.length < 5) return;
        totalLines++;
        if (totalLines === 2) {
          dbStartupTime = parseInt(row[2]) || parseInt(row[1]);
        } else if (totalLines > 2) {
          if (row[0] !== '0' && !isNaN(parseInt(row[2]))) {
            const finishTime = parseInt(row[2]);
            const sec = Math.floor((finishTime - dbStartupTime) / 1000000);
            if (sec >= 0) {
              contagem[sec] = (contagem[sec] || 0) + 1;
            }
          }
        }
      });
      
      const list = Object.keys(contagem).map((sec) => [parseInt(sec), contagem[sec]]);
      telemetry.throughput = list.sort((a, b) => a[0] - b[0]);
    } catch(err) {
      console.error("Erro ao ler datasets de run:", err);
    }
  }

  if (fs.existsSync(monitoringPath)) {
    try {
      const fileContent = fs.readFileSync(monitoringPath, "utf-8");
      const lines = fileContent.split("\n");
      let dbStartupCpu = 0;
      
      lines.forEach((lineText) => {
        const row = lineText.split(";");
        if (row.length < 3) return;
        if (row[0] === "Database startup") {
          dbStartupCpu = parseInt(row[2]);
        } else if (row[0].match(/^\d+$/)) {
          const endTime = parseInt(row[0]);
          const sec = Math.floor((endTime - dbStartupCpu) / 1000000);
          telemetry.monitoring.push([sec, parseFloat(row[1]), parseFloat(row[2])]); // sec, cpu, ram
        }
      });
      telemetry.monitoring.sort((a, b) => a[0] - b[0]);
    } catch(err) {
      console.error("Erro ao ler monitoramento de run:", err);
    }
  }

  res.json(telemetry);
});

// função para contagem de comandos por segundo
const processaCSV = async (ws, inputPath, ctx) => {
  try {
    if (!fs.existsSync(inputPath)) return;
    fs.createReadStream(inputPath, {
      start: ctx.total,
    })
      .on('error', (err) => {
        console.error(`Erro na leitura do stream CSV: ${err.message}`);
      })
      .pipe(csv())
      .on('error', (err) => {
        console.error(`Erro no parser CSV: ${err.message}`);
      })
      .on('data', (row) => {
        ctx.total++;
        lendoArquivo = true;

        // Processar cada linha do CSV
        if (ctx.total === 1) {
          ctx.database_startup_time = parseInt(row.startTime);
        } else if (ctx.total >= 3) {
          if (row.type !== '0' && !isNaN(row.finishTime)) {
            const tempoTermino = parseInt(row.finishTime);
            const tempoEmSegundos = Math.floor((tempoTermino - ctx.database_startup_time) / 1000000);

            if (tempoEmSegundos >= 0) {
              const entryIndex = ctx.contagemComandos.findIndex(entry => entry[0] === tempoEmSegundos);

              if (entryIndex === -1) {
                ctx.contagemComandos.push([tempoEmSegundos, 1]);
              } else {
                ctx.contagemComandos[entryIndex][1]++;
              }
            }
          }
        }

        // Verificar se o tamanho do array aumentou e enviar o penúltimo elemento apenas uma vez
        for (let i = 0; i < ctx.contagemComandos.length; i++) {
          if (ctx.contagemComandos.length > ctx.arrayParaVerificarSeJaFoiEnviado.length) {
            if (i === ctx.contagemComandos.length - 2) {
              ctx.arrayParaVerificarSeJaFoiEnviado.push(ctx.contagemComandos[i]);
              if (ws.readyState === 1) {
                ws.send(JSON.stringify(ctx.contagemComandos[i]));
              }
            }
          }
        }
      })
      .on('end', () => {
        console.log('CSV file successfully processed');
        lendoArquivo = false;
      });
  } catch (err) {
    console.error(`Erro em processaCSV: ${err.message}`);
  }
}

// função para calcular latência
const processaLatencia = async (ws, inputPath, ctx) => {
  try {
    if (!fs.existsSync(inputPath)) return;
    fs.createReadStream(inputPath, {
      start: ctx.totalLatencia,
    })
      .on('error', (err) => {
        console.error(`Erro na leitura do stream de Latência: ${err.message}`);
      })
      .pipe(csv())
      .on('error', (err) => {
        console.error(`Erro no parser de Latência: ${err.message}`);
      })
      .on('data', (row) => {
        ctx.totalLatencia++;
        lendoArquivo = true;

        if (ctx.totalLatencia === 1) {
          ctx.database_startup_time_latencia = parseInt(row.startTime);
        } else if (ctx.totalLatencia >= 3) {
          if (parseInt(row.type) != '0') {
            const num = parseInt((parseInt(row.startTime) - ctx.database_startup_time_latencia) / 1000000);
            if (row.type === 'N') {
              ctx.x1.push(num);
              ctx.y1.push(parseInt(row.latency));
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ x1: [num, parseInt(row.latency)] }));
              }
            }
            if (row.type === 'A') {
              ctx.x2.push(num);
              ctx.y2.push(parseInt(row.latency));
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ x2: [num, parseInt(row.latency)] }));
              }
            }
          }
        }
      });
  } catch (err) {
    console.error(`Erro em processaLatencia: ${err.message}`);
  }
}

// função para processar o dataset de uso de cpu
const processaCpu = async (ws, pathCpu, ctx) => {
  try {
    if (!fs.existsSync(pathCpu)) return;
    const data = await fs.promises.readFile(pathCpu, 'utf-8');
    const lines = data.trim().split('\n');

    if (lines.length > 2) {
      const databaseStartupLine = lines[1].split(';');
      if (databaseStartupLine.length < 3) return;
      const databaseStartupTime = parseInt(databaseStartupLine[2]);

      ctx.databaseStartupCpu = databaseStartupTime;

      lines.splice(0, 2); 

      for (let i = 0; i < lines.length; i++) {
        const linha = lines[i].split(';');
        if (linha.length >= 2 && linha[0].match(/^\d+$/)) {
          const num = Math.floor((parseInt(linha[0]) - databaseStartupTime) / 1000000);
          ctx.x.push(num);
          const cpuVal = parseFloat(linha[1].replace(',', '.'));
          ctx.y.push(cpuVal);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify([num, cpuVal]));
          }
        }
      }
    }
  } catch (err) {
    console.error(`Erro em processaCpu: ${err.message}`);
  }
}

// função para processar o dataset de uso de memória
const processaMemoria = async (ws, pathMemoria, ctx) => {
  try {
    if (!fs.existsSync(pathMemoria)) return;
    const data = await fs.promises.readFile(pathMemoria, 'utf-8');
    const lines = data.trim().split('\n');

    if (lines.length > 2) {
      const databaseStartupLine = lines[1].split(';');
      if (databaseStartupLine.length < 3) return;
      const databaseStartupTime = parseInt(databaseStartupLine[2]);

      ctx.databaseStartupMemoria = databaseStartupTime;

      lines.splice(0, 2); 

      for (let i = 0; i < lines.length; i++) {
        const linha = lines[i].split(';');
        if (linha.length >= 3 && linha[0].match(/^\d+$/)) {
          const num = Math.floor((parseInt(linha[0]) - databaseStartupTime) / 1000000);
          ctx.x.push(num);
          ctx.y.push(parseFloat(linha[2]));
          if (ws.readyState === 1) {
            ws.send(JSON.stringify([num, parseInt(linha[2])]));
          }
        }
      }
    }
  } catch (err) {
    console.error(`Erro em processaMemoria: ${err.message}`);
  }
}

// conexão websocket
wss.on('connection', async (ws, req) => {
  console.log('Client connected');
  try {
    // rota websocket para o dataset de comandos por segundo
    if (req.url === '/data') {
      let initialStartupTime = 0;
      try {
        if (fs.existsSync(inputPath)) {
          const fileContent = fs.readFileSync(inputPath, 'utf8');
          const lines = fileContent.split('\n');
          for (const line of lines) {
            if (line.startsWith("Database startup")) {
              const parts = line.split(',');
              if (parts.length >= 3 && parts[2]) {
                initialStartupTime = parseInt(parts[2], 10);
                break;
              }
            }
          }
        }
      } catch (e) {
        console.error("Error reading startup time from CSV:", e);
      }

      const dataCtx = {
        total: 0,
        database_startup_time: initialStartupTime,
        contagemComandos: [],
        arrayParaVerificarSeJaFoiEnviado: []
      };

      const watcher = setupTailWatcher(inputPath, (data) => {
        const line = data.split(',');
        const endTime = parseInt(line[2]);

        if (line[0] === "Database startup" || line[0] === "Shutdown") {
          return;
        }

        if (line[0] !== '0' && !isNaN(endTime)) {
          const baseTime = dataCtx.database_startup_time || endTime;
          const tempoEmSegundos = Math.floor((endTime - baseTime) / 1000000);

          if (tempoEmSegundos >= 0) {
            const entryIndex = dataCtx.contagemComandos.findIndex(entry => entry[0] === tempoEmSegundos);

            if (entryIndex === -1) {
              dataCtx.contagemComandos.push([tempoEmSegundos, 1]);
            } else {
              dataCtx.contagemComandos[entryIndex][1]++;
            }
          }
        }

        for (let i = 0; i < dataCtx.contagemComandos.length; i++) {
          if (dataCtx.contagemComandos.length > dataCtx.arrayParaVerificarSeJaFoiEnviado.length) {
            if (i === dataCtx.contagemComandos.length - 2) {
              dataCtx.arrayParaVerificarSeJaFoiEnviado.push(dataCtx.contagemComandos[i]);
              if (ws.readyState === 1) {
                ws.send(JSON.stringify(dataCtx.contagemComandos[i]));
              }
            }
          }
        }
      });

      // Delay para garantir que o frontend processe o onopen/onClearData antes do batch histórico
      await new Promise(resolve => setTimeout(resolve, 100));
      await processaCSV(ws, inputPath, dataCtx);

      ws.on('close', () => {
        watcher.close();
      });
    }
    
    // rota websocket para o dataset de uso de cpu
    else if (req.url === '/cpu') {
      let initialStartupTime = 0;
      try {
        if (fs.existsSync(pathCpu)) {
          const fileContent = fs.readFileSync(pathCpu, 'utf8');
          const lines = fileContent.split('\n');
          if (lines.length > 1) {
            const parts = lines[1].split(';');
            if (parts.length >= 3 && parts[2]) {
              initialStartupTime = parseInt(parts[2], 10);
            }
          }
        }
      } catch (e) {
        console.error("Error reading startup time from CPU log:", e);
      }

      const cpuCtx = {
        databaseStartupCpu: initialStartupTime,
        x: [],
        y: []
      };

      const watcher = setupTailWatcher(pathCpu, (data) => {
        const lines = data.split(';');
        const endTime = parseInt(lines[0]);

        if (lines[0] === "Database startup") {
          return;
        }

        if (lines[0].match(/^\d+$/)) {
          const baseTime = cpuCtx.databaseStartupCpu || endTime;
          const num = Math.floor((endTime - baseTime) / 1000000);
          const cpuVal = parseFloat(lines[1].replace(',', '.'));
          cpuCtx.x.push(num);
          cpuCtx.y.push(cpuVal);
          ws.send(JSON.stringify([num, cpuVal]));
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      await processaCpu(ws, pathCpu, cpuCtx);

      ws.on('close', () => {
        watcher.close();
      });
    }
  
  // rota para iniciar o servidor MM-DIRECT
  else if (req.url === '/start') {
    sanitizePipeline();

    // 1. Cria diretório do ensaio
    const runId = `run_${Date.now()}`;
    const runDir = path.join(rootPath, "src/runs", runId);
    try {
      fs.mkdirSync(runDir, { recursive: true });
      console.log(`Diretório do ensaio criado em: ${runDir}`);
    } catch(err) {
      console.error("Erro ao criar diretório do ensaio:", err.message);
    }

    currentRunId = runId;
    currentRunDir = runDir;
    currentRunLogs = [];

    // 2. Grava metadata.json
    const startTimes = getTimestamps();
    const metadata = {
      id: runId,
      timestamp: startTimes.utc,
      timestampLocal: startTimes.local,
      timezone: "America/Sao_Paulo",
      config: activeConfig,
      mode: (activeConfig.instantRecoveryState || "ON").toUpperCase() === "ON" ? "MM-DIRECT (B-Tree)" : "Tradicional (AOF)",
      initialExpectedState: "Carregando Banco",
      caminhos: {
        aof: path.join(rootPath, "src", activeConfig.aofFilename || "logs/sequentialLog.aof"),
        datasets: path.join(rootPath, "src", activeConfig.executedCommandsCsvFilename || "datasets/datasets.csv"),
        monitoring: path.join(rootPath, "src", activeConfig.systemMonitoringCsvFilename || "system_monitoring/system_monitoring.csv")
      }
    };

    try {
      fs.writeFileSync(path.join(runDir, "metadata.json"), JSON.stringify(metadata, null, 2));
      console.log("Arquivo metadata.json gravado com sucesso!");
    } catch(err) {
      console.error("Erro ao gravar metadata.json:", err.message);
    }

    const redisServerPath = path.join(rootPath, 'src');
    const child = child_process.spawn('./redis-server', [], { cwd: redisServerPath });

    child.on('error', (err) => {
      console.error(`Erro ao iniciar o servidor Redis: ${err}`);
      if (ws.readyState === 1) {
        ws.send(`Erro ao iniciar o servidor Redis: ${err.message}`);
      }
    });

    child.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output);
      
      // Acumula logs locais do ensaio
      currentRunLogs.push(output);
      try {
        fs.appendFileSync(path.join(currentRunDir, "logs.txt"), output);
      } catch(err) {
        // Ignorar
      }

      if (ws.readyState === 1) {
        ws.send('Redis server started');
        ws.send(output);

        const regex2 = /Generating information about executed database commands .../;
        const regex3 = /Generating system monitoring .../;

        if (regex2.test(output)) {
          console.log('Gerando informações sobre os comandos do banco de dados executados ...');
          ws.send('Generating information database commands');
        }

        if (regex3.test(output)) {
          console.log('Gerando monitoramento do sistema ...');
          ws.send('Generating system monitoring');
        }
      }
    });

    child.on('exit', (code, signal) => {
      console.log(`Processo redis-server encerrado com código ${code} e sinal ${signal}`);
      if (ws.readyState === 1) {
        ws.send(`Redis server stopped with code ${code}`);
      }
      // Finaliza o ensaio gravando os resultados consolidados
      finalizeRunResults();
    });
  }
  
  // rota para parar o servidor MM-DIRECT
  else if (req.url === '/stop') {
    const redisServerPath = path.join(rootPath, 'src');
    const child = child_process.spawn('./redis-cli', ['shutdown'], { cwd: redisServerPath });

    child.on('error', (err) => {
      console.error(`Erro ao parar o servidor Redis via redis-cli: ${err}`);
      if (ws.readyState === 1) {
        ws.send(`Erro ao parar o servidor Redis: ${err.message}`);
      }
    });

    child.on('exit', (code, signal) => {
      console.log(`redis-cli shutdown encerrado com código ${code} e sinal ${signal}`);
      if (ws.readyState === 1) {
        ws.send('Redis server stopped');
        ws.close();
      }
    });

    child.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output);
      if (ws.readyState === 1) {
        ws.send(output);
      }
    });
  }

  else if (req.url === '/memory') {
    let initialStartupTime = 0;
    try {
      if (fs.existsSync(pathCpu)) {
        const fileContent = fs.readFileSync(pathCpu, 'utf8');
        const lines = fileContent.split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(';');
          if (parts.length >= 3 && parts[2]) {
            initialStartupTime = parseInt(parts[2], 10);
          }
        }
      }
    } catch (e) {
      console.error("Error reading startup time from Memory log:", e);
    }

    const memCtx = {
      databaseStartupMemoria: initialStartupTime,
      x: [],
      y: []
    };

    const watcher = setupTailWatcher(pathCpu, (data) => {
      const lines = data.split(';');
      const endTime = parseInt(lines[0]);

      if (lines[0] === "Database startup") {
        return;
      }

      if (lines[0].match(/^\d+$/)) {
        const baseTime = memCtx.databaseStartupMemoria || endTime;
        const num = Math.floor((endTime - baseTime) / 1000000);
        memCtx.x.push(num);
        memCtx.y.push(parseFloat(lines[2]));
        ws.send(JSON.stringify([num, parseInt(lines[2])]));
      }
    });

    await new Promise(resolve => setTimeout(resolve, 100));
    await processaMemoria(ws, pathCpu, memCtx);

    ws.on('close', () => {
      watcher.close();
    });
  }

  else if (req.url === '/latencia') {
    let initialStartupTime = 0;
    try {
      if (fs.existsSync(inputPath)) {
        const fileContent = fs.readFileSync(inputPath, 'utf8');
        const lines = fileContent.split('\n');
        for (const line of lines) {
          if (line.startsWith("Database startup")) {
            const parts = line.split(',');
            if (parts.length >= 3 && parts[2]) {
              initialStartupTime = parseInt(parts[2], 10);
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error("Error reading startup time from CSV:", e);
    }

    const latCtx = {
      totalLatencia: 0,
      database_startup_time_latencia: initialStartupTime,
      x1: [],
      y1: [],
      x2: [],
      y2: []
    };

    const watcher = setupTailWatcher(inputPath, (data) => {
      const lines = data.split(',');
      const endTime = parseInt(lines[2]);

      if (lines[0] === "Database startup" || lines[0] === "Shutdown") {
        return;
      }

      if (lines[0] !== '0' && !isNaN(endTime)) {
        const baseTime = latCtx.database_startup_time_latencia || endTime;
        const num = Math.floor((endTime - baseTime) / 1000000);

        if (lines[5] === 'N') {
          latCtx.x1.push(num);
          latCtx.y1.push(parseInt(lines[4]));
          ws.send(JSON.stringify({ x1: [num, parseInt(lines[4])] }));
        }
        if (lines[5] === 'A') {
          latCtx.x2.push(num);
          latCtx.y2.push(parseInt(lines[4]));
          ws.send(JSON.stringify({ x2: [num, parseInt(lines[4])] }));
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 100));
    await processaLatencia(ws, inputPath, latCtx);

    ws.on('close', () => {
      watcher.close();
    });
  }
  
    else {
      ws.send('Invalid URL');
    }
  } catch (err) {
    console.error("Erro na conexão WebSocket:", err);
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ error: err.message }));
      }
    } catch(e) {}
  }
});

// Tratamento global de erros de processo (Boas Práticas de Resiliência)
process.on('unhandledRejection', (reason, promise) => {
  console.error("Rejeição Não Tratada (Unhandled Rejection) detectada:", reason);
  // Log estruturado para diagnóstico sem derrubar o processo caso não seja fatal
});

process.on('uncaughtException', (error) => {
  console.error("Exceção Não Capturada (Uncaught Exception) fatal detectada:", error);
  // Loga o erro crítico e encerra o processo de forma controlada para que o supervisor possa reiniciá-lo de estado limpo
  process.exit(1);
});
