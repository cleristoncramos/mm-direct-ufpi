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

let rootPath = null; // Caminho do arquivo CSV a ser processado
// ler arquivo json config.json
const config = await JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

rootPath = os.homedir() + config.path;

// Caminho do arquivo CSV a ser processado
const inputPath = rootPath + "/src/datasets/datasets.csv"
const pathCpu = rootPath + "/src/system_monitoring/system_monitoring.csv"

// Variáveis de controle
let total = 0; // Contador de linhas no CSV
let totalLatencia = 0; // Contador de linhas no CSV
let database_startup_time = 0; // Armazena o tempo de inicialização do banco de dados
let database_startup_time_latencia = 0; // Armazena o tempo de inicialização do banco de dados
const contagemComandos = []; // Armazena os arrays de contagem de comandos por segundo
let arrayParaVerificarSeJaFoiEnviado = []; // Armazena os arrays para verificação de envio
let lendoArquivo = false; // Variável de controle para verificar se o arquivo está sendo lido
const x = [];
const y = [];
const x1 = [];
const x2 = [];
const y1 = [];
const y2 = [];
let databaseStartupCpu = 0;
let databaseStartupMemoria = 0;

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
  modifyConfigFile(config, rootPath);
  res.json(config);
});

// função para contagem de comandos por segundo
const processaCSV = async (ws, inputPath) => {
  fs.createReadStream(inputPath, {
    start: total,
  })
    .pipe(csv())
    .on('data', (row) => {
      total++;
      lendoArquivo = true;

      // Processar cada linha do CSV
      if (total === 1) {
        database_startup_time = parseInt(row.startTime);
      } else if (total >= 3) {
        if (row.type !== '0' && !isNaN(row.finishTime)) {
          const tempoTermino = parseInt(row.finishTime);
          const tempoEmSegundos = Math.floor((tempoTermino - database_startup_time) / 1000000);

          if (tempoEmSegundos >= 0) {
            const entryIndex = contagemComandos.findIndex(entry => entry[0] === tempoEmSegundos);

            if (entryIndex === -1) {
              contagemComandos.push([tempoEmSegundos, 1]);
            } else {
              contagemComandos[entryIndex][1]++;
            }
          }
        }
      }

      // Verificar se o tamanho do array aumentou e enviar o penúltimo elemento apenas uma vez
      for (let i = 0; i < contagemComandos.length; i++) {
        if (contagemComandos.length > arrayParaVerificarSeJaFoiEnviado.length) {
          if (i === contagemComandos.length - 2) {
            arrayParaVerificarSeJaFoiEnviado.push(contagemComandos[i]);
            ws.send(JSON.stringify(contagemComandos[i]));
          }
        }
      }
    })
    .on('end', () => {
      console.log('CSV file successfully processed');
      lendoArquivo = false;
    });
}

// função para calcular latência
const processaLatencia = async (ws, inputPath) => {
  fs.createReadStream(inputPath, {
    start: totalLatencia,
  })
    .pipe(csv())
    .on('data', (row) => {
      totalLatencia++;
      lendoArquivo = true;

      if (totalLatencia === 1) {
        database_startup_time_latencia = parseInt(row.startTime);
      } else if (totalLatencia >= 3) {
        if (parseInt(row.type) != '0') {
          const num = parseInt((parseInt(row.startTime) - database_startup_time_latencia) / 1000000);
          if (row.type === 'N') {
            x1.push(num);
            y1.push(parseInt(row.latency));
            ws.send(JSON.stringify({ x1: [num, parseInt(row.latency)] }));
          }
          if (row.type === 'A') {
            x2.push(num);
            y2.push(parseInt(row.latency));
            ws.send(JSON.stringify({ x2: [num, parseInt(row.latency)] }));
          }
        }
      }
    })
}

// função para processar o dataset de uso de cpu
const processaCpu = async (ws, pathCpu) => {
  const data = await fs.promises.readFile(pathCpu, 'utf-8');
  const lines = data.trim().split('\n');

  if (lines.length > 2) {
    const databaseStartupLine = lines[1].split(';');
    const databaseStartupTime = parseInt(databaseStartupLine[2]);

    databaseStartupCpu = databaseStartupTime;

    console.log(databaseStartupCpu)
    console.log(lines)

    lines.splice(0, 2); 

    for (let i = 0; i < lines.length; i++) {
      const linha = lines[i].split(';');
      if (linha[0].match(/^\d+$/)) {
        const num = Math.floor((parseInt(linha[0]) - databaseStartupTime) / 1000000);
        x.push(num);
        y.push(parseFloat(linha[1]));
        ws.send(JSON.stringify([num, parseFloat(linha[1])]));
      }
    }
  }
}

// função para processar o dataset de uso de memória
const processaMemoria = async (ws, pathMemoria) => {
  const data = await fs.promises.readFile(pathCpu, 'utf-8');
  const lines = data.trim().split('\n');

  if (lines.length > 2) {
    const databaseStartupLine = lines[1].split(';');
    const databaseStartupTime = parseInt(databaseStartupLine[2]);

    databaseStartupMemoria = databaseStartupTime;

    lines.splice(0, 2); 

    for (let i = 0; i < lines.length; i++) {
      const linha = lines[i].split(';');
      if (linha[0].match(/^\d+$/)) {
        const num = Math.floor((parseInt(linha[0]) - databaseStartupTime) / 1000000);
        x.push(num);
        y.push(parseFloat(linha[2]));
        ws.send(JSON.stringify([num, parseInt(lines[2])]));
      }
    }
  }
}

// conexão websocket
wss.on('connection', async (ws, req) => {
  console.log('Client connected');

  // rota websocket para o dataset de comandos por segundo
  if (req.url === '/data') {
    const tail = new Tail(inputPath);
    
    tail.on("error", function(error) {
      console.log('Aviso do Monitor (Tail - Data): Arquivo datasets.csv foi movido ou recriado.');
      try { tail.unwatch(); } catch (e) {}
    });

    await processaCSV(ws, inputPath);

    tail.on("line", function (data) {
      const line = data.split(',');
      const endTime = parseInt(line[2]);

      if (line[0] !== '0' && !isNaN(endTime)) {
        const tempoEmSegundos = Math.floor((endTime - database_startup_time) / 1000000);

        if (tempoEmSegundos >= 0) {
          const entryIndex = contagemComandos.findIndex(entry => entry[0] === tempoEmSegundos);

          if (entryIndex === -1) {
            contagemComandos.push([tempoEmSegundos, 1]);
          } else {
            contagemComandos[entryIndex][1]++;
          }
        }
      }

      for (let i = 0; i < contagemComandos.length; i++) {
        if (contagemComandos.length > arrayParaVerificarSeJaFoiEnviado.length) {
          if (i === contagemComandos.length - 2) {
            arrayParaVerificarSeJaFoiEnviado.push(contagemComandos[i]);
            ws.send(JSON.stringify(contagemComandos[i]));
          }
        }
      }
    });

    ws.on('close', () => {
      try { tail.unwatch(); } catch (e) {}
      contagemComandos.length = 0;
      arrayParaVerificarSeJaFoiEnviado.length = 0;
      total = 0;
      database_startup_time = 0;
    });
  }
  
  // rota websocket para o dataset de uso de cpu
  else if (req.url === '/cpu') {
    await processaCpu(ws, pathCpu);

    const tail = new Tail(pathCpu);

    tail.on("error", function(error) {
      console.log('Aviso do Monitor (Tail - CPU): Arquivo system_monitoring.csv foi movido ou recriado.');
      try { tail.unwatch(); } catch (e) {}
    });

    tail.on("line", function (data) {
      const lines = data.split(';')
      const endTime = parseInt(lines[0]);

      if (lines[0] === "Database startup") {
        databaseStartupCpu = parseInt(lines[2]);
      }

      if (lines[0].match(/^\d+$/)) {
        const num = Math.floor((endTime - databaseStartupCpu) / 1000000);
        x.push(num);
        y.push(parseFloat(lines[1]));
        ws.send(JSON.stringify([num, parseFloat(lines[1])]));
      }
    });

    ws.on('close', () => {
      try { tail.unwatch(); } catch (e) {}
      x.length = 0;
      y.length = 0;
    });
  }
  
  // rota para iniciar o servidor MM-DIRECT
  else if (req.url === '/start') {
    const redisServerPath = path.join(rootPath, '/src');
    process.chdir(redisServerPath);

    const logFile = path.join(redisServerPath, 'datasets/datasets.csv');
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }

    const child = child_process.spawn('./redis-server');

    child.on('error', (err) => {
      console.error(`Erro ao iniciar o servidor Redis: ${err}`);
    });

    child.stdout.on('data', (data) => {
      ws.send('Redis server started');
      const output = data.toString();
      console.log(output);
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
    });

    ws.on('close', () => {
      child.kill();
    });
  }
  
  // rota para parar o servidor MM-DIRECT
  else if (req.url === '/stop') {
    const redisServerPath = path.join(__dirname, '../../MM-DIRECT/src');
    process.chdir(redisServerPath);

    const child = child_process.spawn('./redis-cli', ['shutdown']);

    child.on('error', (err) => {
      console.error(`Erro ao iniciar o servidor Redis: ${err}`);
    });

    child.on('exit', (code, signal) => {
      console.log(`Servidor Redis encerrado com código ${code} e sinal ${signal}`);
      ws.send('Redis server stopped');
      ws.close();
    });

    child.stdout.on('data', (data) => {
      ws.send('Redis server stopped');
      const output = data.toString();
      console.log(output);
    });

    ws.on('close', () => {
      child.kill();
    });
  }

  else if (req.url === '/memory') {
    const tail = new Tail(pathCpu);

    tail.on("error", function(error) {
      console.log('Aviso do Monitor (Tail - Memory): Arquivo system_monitoring.csv foi movido ou recriado.');
      try { tail.unwatch(); } catch (e) {}
    });

    await processaMemoria(ws, pathCpu);

    tail.on("line", function (data) {
      const lines = data.split(';')
      const endTime = parseInt(lines[0]);

      if (lines[0] === "Database startup") {
        databaseStartupMemoria = parseInt(lines[2]);
      }

      if (lines[0].match(/^\d+$/)) {
        const num = Math.floor((endTime - databaseStartupMemoria) / 1000000);
        x.push(num);
        y.push(parseFloat(lines[2]));
        ws.send(JSON.stringify([num, parseInt(lines[2])]));
      }
    });

    ws.on('close', () => {
      try { tail.unwatch(); } catch (e) {}
    });
  }

  else if (req.url === '/latencia') {
    await processaLatencia(ws, inputPath);
    console.log('latencia')
    const tail = new Tail(inputPath);

    tail.on("error", function(error) {
      console.log('Aviso do Monitor (Tail - Latência): Arquivo datasets.csv foi movido ou recriado.');
      try { tail.unwatch(); } catch (e) {}
    });

    tail.on("line", function (data) {
      const lines = data.split(',')
      const endTime = parseInt(lines[2]);

      if (lines[0] !== '0' && !isNaN(endTime)) {
        const num = Math.floor((endTime - database_startup_time) / 1000000);

        if (lines[5] === 'N') {
          x1.push(num);
          y1.push(parseInt(lines[4]));
          ws.send(JSON.stringify({ x1: [num, parseInt(lines[4])] }));
        }
        if (lines[5] === 'A') {
          x2.push(num);
          y2.push(parseInt(lines[4]));
          ws.send(JSON.stringify({ x2: [num, parseInt(lines[4])] }));
        }
      }
    });

    ws.on('close', () => {
      try { tail.unwatch(); } catch (e) {}
    });
  }
  
  else {
    ws.send('Invalid URL');
  }
});
