import fs from "fs";

const stringConf = `/////////////////////////////////////////////////////////////////////////////////////////
//		Redis Instant Recovery (RedisIR) configurations file
//	Below are the parameters for executing RedisIR and a brief explanation of its functions. 
//
//	IR_ON == on | true		IR_OFF == off | false


/////////////////////////////////////////////////////////////////////////////////////////
// 				Indexer component options

//	Sequential log filename
//
aof_filename = "logs/sequentialLog.aof";
//
//	Enables Instant Recovery Shema. Otherwise, sequential log recovery is enabled.
//
instant_recovery_state = "ON"; 
//
//	Data structuter of the indexed log. 
//
indexedlog_structure = "BTREE";  
//
//	Enables sychronous logging indexing, i.e., a transaction must wait the log indexing. 
//	If OFF is setted, the log indexing is asychronous, i.e., a transaction must not wait 
//	for the log indexing. OFF is the default value.
//
instant_recovery_synchronous = "OFF";  
//
//	Indexed log filename
//
indexedlog_filename = "logs/indexedLog.db";
//
//	Starts the asynchronous indexing of log records before (B) or after (A) the database 
//	recovery. The value B means that the Indexer toThe default value is "A". If the 
//	checkpoint is ON, it will start right after the indexer.
//
starts_log_indexing = "A";
//
//	Tunes the time interval to index log records. The default value is 500,000 microseconds.
//
indexer_time_interval = 500;
//
//	Displays some information about log indexing process. The default value is OFF.
//
display_indexer_information = "OFF"; 
//
//	Time interval (in seconds) to display information about the log indexing when the field
// display_indexer_information is ON. The default value is 60.
//
indexer_information_time_interaval = 10;
//
//	Redis host name used by the Restorer component. A client application is used to 
//	load tuples into memory using the indexed log during database recovery.  
//	The default host is 127.0.0.1.
//
redisHostname = "127.0.0.1";
//
//	Redis host port. The default port is 6379.
//
redisPort = 6379;
//
//	Displays some information about log restorer during database recovery process. 
//	The default value is OFF.
//
display_restorer_information = "OFF";  
//
//	Time interval (in seconds) to display information about the log indexing when the field
// display_indexer_information is ON. The default value is 60.
//
restorer_information_time_interaval = 5;
//
//	Replicates indexed log file. When a replica is used, the replication is disabled.
//	The default value is OFF.
//
indexedlog_replicated = "OFF"; 
//
//	Indexed log replicated filename.
//
indexedlog_replicated_filename = "logs/indexedLog_rep.db";
//
//	Simulate a log corruption by deleting the indexed log and shuting down the system
//	after a given time. If the value is 0 (zero), the log corruption is disabled. The 
//	default value is 0. In a log corruption, first, the system tries to use the log
//	replica. Next, it tries to rebuild the indexed log or porform the default recovery.
//	
log_corruption = 0;
//
//	Rebuilds the indexed log from the last checkpoint record in case of log curruption.
//	The rebulding is performed only if there is not a replica. If is OFF and there is
//	not a replica, the default recovery is performed. The default value is ON.
//	
rebuild_indexedlog = "OFF";



/////////////////////////////////////////////////////////////////////////////////////////
// 				Checkpointer component options

//	Enables the checkpoint of the indexed log during normal database processing.
//
checkpoint_state = "ON";  
//
//	Checkpoints only the most frequently used tuples. The defaul value is OFF.
//
checkpoints_only_mfu = "OFF";  
//
//	Maximum number of tuples most frequently used to be checkpointed. The defaul value is 0
//	(zero). If the value is 0, then all tuples used by the system will considered mfu.
//
num_mfu_tuples = 0;
//
//	Number of checkpoint processes to be performed. If the value is 0 (zero), the checkpoint
//	will be perfomed continuously in time invervals. The defaul value is 0.
//
number_checkpoints = 0;
//
//	Enables the self tune of time interval between checkpoint executions. The value of the
//	time interval between checkpoints is self tuned after each checkpoint process. The defaul 
//	value is OFF.
//
selftune_checkpoint_time_interval = "OFF"; 
//
//	A fixed time interval (in seconds) to perform checkpoints. This parameter works only if the 
//	parameter 'selftune_checkpoint_time_interval' is OFF. The default value is 60 seconds.
//
checkpoint_time_interval = 10;
//
//	Time (in seconds) to start the first checkpoint process after the checkpoint thread is 
//	started. The defaul value is 0.
//
first_checkpoint_start_time = 0;
//
//	Stops the checkpoint thread after the Memtier benchmark execution.
//	The defaul value is ON.
//
stop_checkpoint_after_benchmark = "ON";  
//
//	Displays some information about checkpoint execution at the end of each checkpoint process. 
//	The default value is OFF.
//
display_checkpoint_information = "OFF"; 


/////////////////////////////////////////////////////////////////////////////////////////
// 				Failure simulation options
//	Options to simulate system failures by system restart. The options bellow must not be
//	used together the beckmark restart options.

//	Restart daley (in seconds) before the system restart. The default value is 1.
//
restart_daley_time = 1;
//
//	Shots down the system after a given time (in seconds) and then restarts the system. The 
//	default value is 200 seconds.
//
restart_after_time = 30;
//
//	Number of times to restart the system after the given time (restart_after_time). If the
//	value is 0 (zero), nothing is done. The default value is 0.
//
number_restarts_after_time = 0;
//
//	Loads the database into memory and then shots down the system after the given time, and 
//  then restars the system. The value given is the time to restart in seconds. 
//	If the value is 0 (zero), nothing is done. The default value is 0.
//
preload_database_and_restart = 0;
//
//	Number of times to restart the system after preloading. If the value is 0 (zero), the
// 	system is preloaded, but it is not restarted. It is important to note that after the
//	failures, the database is not preloaded again. Instead of that, it is performed a
//	database recovery. The default value is 1.
//
number_restarts_after_preloading = 1;
//
//restart_time_after_first_restart


/////////////////////////////////////////////////////////////////////////////////////////
// 				Memtier Bechmark execution options
//	Options to perform Memtier automatically in RedisIR.

//	Enables Memtier automatic execution. The default value is OFF.
//
memtier_benchmark_state = "OFF";
//
//	Memtier workload run times. If the value is 0 (zero), the workload will be runned 
//	continuously. The default value is 1.
//
memtier_benchmark_workload_run_times = 1;
//
//	Number of time to restart the database system after the benchmark performing. This
//	useful to simulate successive failures. If the value is 0 (zero) the system will 
//	not be restarted. The default value is 0.
//
restart_after_bechmarking = 0;
//
//	Always stops the benchmark performing after a defined time (in seconds) from the database
//	startup time, even if successive restarts occur, each new workload will be stoped the given
//	time. If the value is 0 (zero) the system will not be stopped. The default value is 0.
//
time_tostop_benchmarking = 0;
//
//	Memtier execution parameters. Run the command line './memtier_benchmark --help' on 
//	Memtier root path to see all parameters.
//	Some default values: 50,000 clients; 4 threads; 10,000 per client; 1:10 Set:Get ratio;
//	uniform random key pattern (R). 
//	Below are some examples of parameters. 
//
memtier_benchmark_parameters = " --hide-histogram -n 5000 --key-prefix='redisIR-' --key-minimum=1 --key-maximum=5000 --command='set __key__ __data__' --command-ratio=5000 --command-key-pattern=S";
//
//
/////////////////////////////////////////////////////////////////////////////////////////
// 				Report options
//	This file can be used to generate graphics by the scripts in Redis root path.

//	Generates some reports about recovery, checkpoint and indexer. The default value is "OFF". 
//
generate_recovery_report = "OFF"; 
//
//	Name of the file containig some information about recovery. It is used to save the file 
//	automatically.
//
recovery_report_filename = "recovery_report/recovery_report.txt";
//
//	Generates the recovery report file automatically after the memtier benckmark have 
//	finished. The default value is ON.
//
generate_report_file_after_benchmarking = "ON"; 
//
//	Generates a CSV file containing some information about all database operantins (commands) 
//	executed. The fields: command name, key of the tuple handled, command start time, command 
//	finishTime, and command type. The default value is OFF.	
//
generate_executed_commands_csv = "OFF";
//
//	Name of the CSV file containing proprieties about operations executed.
//
executed_commands_csv_filename = "datasets/datasets.csv";
//
//	Generates a CSV file containing some information about indexing rate. The default 
//	value is OFF.
//
generate_indexing_report_csv = "OFF";
//
//	Name of the CSV file containing proprieties about indexing process.
//	It is used to save the file automatically.
//
indexing_report_csv_filename = "indexing_report/indexing.csv";
//
//	Overwrites the previous recovery report and CSV files after system restart. Otherwise,
//	concatenates the information. If the system is restart in your experiment, you 
//	should use this parameter as OFF to not overwrite the information saved before a restart. 
//	The default value is ON.
//
overwrite_report_files = "ON";


/////////////////////////////////////////////////////////////////////////////////////////
// 				System monitoring

// Generates the system monitoring about CPU and memory usage. The default value is OFF.
//
system_monitoring = "OFF";  //ON | OFF
//
//	Stops system monitoring generation at benckmark end. The default value is ON.
//
stop_system_monitoring_end_benckmark = "ON";  //ON | OFF
//
//	CSV file for the system monitoring.
//
system_monitoring_csv_filename = "system_monitoring/system_monitoring.csv";
//
//	Tunes the time interval to write to the CSV file in seconds. The default value is 
//	10 seconds.
//
system_monitoring_time_interval = 10;
//
//	Overwrites the previous CSV file. It is usefull in a restart to not overwrite the 
//	previous stored data. The default value is ON.
//
overwrite_system_monitoring = "ON";  //ON | OFF
`;

// função para modificar o arquivo de configuração redis_ir.conf
export function modifyConfigFile(config, rootPath) {
    const {
        aofFilename = "logs/sequentialLog.aof",
        instantRecoveryState = "ON",
        instantRecoverySynchronous = "OFF",
        indexedlogStructure = "BTREE",
        synchronousLogging = "OFF",
        indexedlogFilename = "logs/indexedLog.db",
        startsLogIndexing = "A",
        indexerTimeInterval = 500,
        displayIndexerInformation = "OFF",
        indexerInformationTimeInteraval = 60,
        redisHostname = "127.0.0.1",
        redisPort = 6379,
        displayRestorerInformation = "OFF",
        restorerInformationTimeInteraval = 60,
        indexedlogReplicated = "OFF",
        indexedlogReplicatedFilename = "logs/indexedLog_rep.db",
        logCorruption = 0,
        rebuildIndexedlog = "ON",
        checkpointState = "OFF",
        checkpointsOnlyMfu = "OFF",
        numMfuTuples = 0,
        numberCheckpoints = 0,
        selftuneCheckpointTimeInterval = "OFF",
        checkpointTimeInterval = 60,
        firstCheckpointStartTime = 0,
        stopCheckpointAfterBenchmark = "ON",
        displayCheckpointInformation = "OFF",
        restartDaleyTime = 1,
        restartAfterTime = 200,
        numberRestartsAfterTime = 0,
        preloadDatabaseAndRestart = 0,
        numberRestartsAfterPreloading = 1,
        memtierBenchmarkState = "OFF",
        memtierBenchmarkWorkloadRunTimes = 1,
        restartAfterBenchmarking = 0,
        timeTostopBenchmarking = 0,
        memtierBenchmarkParameters = "--hide-histogram -n 5000 --key-prefix='redisIR-' --key-minimum=1 --key-maximum=5000 --command='set  __key__ __data__' --command-ratio=5000 --command-key-pattern=S",
        generateRecoveryReport = "OFF",
        recoveryReportFilename = "recovery_report/recovery_report.txt",
        generateReportFileAfterBenchmarking = "ON",
        generateExecutedCommandsCsv = "OFF",
        executedCommandsCsvFilename = "datasets/datasets.csv",
        generateIndexingReportCsv = "OFF",
        indexingReportCsvFilename = "indexing_report/indexing.csv",
        overwriteReportFiles = "ON",
        systemMonitoring = "OFF",
        stopSystemMonitoringEndBenchmark = "ON",
        systemMonitoringCsvFilename = "system_monitoring/system_monitoring.csv",
        systemMonitoringTimeInterval = 10,
        overwriteSystemMonitoring = "ON",
    } = config;
String.prototype.toUpperCase()
    const modifiedStringConf = stringConf
        .replace(/aof_filename = "[^"]*";/, `aof_filename = "${aofFilename}";`)
        .replace(
            /instant_recovery_state = "[^"]*";/,
            `instant_recovery_state = "${instantRecoveryState.toUpperCase()}";`
        )
        .replace(
            /instant_recovery_synchronous = "[^"]*";/,
            `instant_recovery_synchronous  = "${instantRecoverySynchronous.toUpperCase()}";`
        )
        .replace(
            /indexedlog_structure = "[^"]*";/,
            `indexedlog_structure = "${indexedlogStructure}";`
        )
        .replace(
            /instant_recovery_synchronous = "[^"]*";/,
            `instant_recovery_synchronous = "${synchronousLogging}";`
        )
        .replace(
            /indexedlog_filename = "[^"]*";/,
            `indexedlog_filename = "${indexedlogFilename}";`
        )
        .replace(
            /starts_log_indexing = "[^"]*";/,
            `starts_log_indexing = "${startsLogIndexing}";`
        )
        .replace(
            /indexer_time_interval = [^;]*;/,
            `indexer_time_interval = ${indexerTimeInterval};`
        )
        .replace(
            /display_indexer_information = "[^"]*";/,
            `display_indexer_information = "${displayIndexerInformation}";`
        )
        .replace(
            /indexer_information_time_interaval = [^;]*;/,
            `indexer_information_time_interaval = ${indexerInformationTimeInteraval};`
        )
        .replace(
            /redisHostname = "[^"]*";/,
            `redisHostname = "${redisHostname}";`
        )
        .replace(/redisPort = [^;]*;/, `redisPort = ${redisPort};`)
        .replace(
            /display_restorer_information = "[^"]*";/,
            `display_restorer_information = "${displayRestorerInformation}";`
        )
        .replace(
            /restorer_information_time_interaval = [^;]*;/,
            `restorer_information_time_interaval = ${restorerInformationTimeInteraval};`
        )
        .replace(
            /indexedlog_replicated = "[^"]*";/,
            `indexedlog_replicated = "${indexedlogReplicated}";`
        )
        .replace(
            /indexedlog_replicated_filename = "[^"]*";/,
            `indexedlog_replicated_filename = "${indexedlogReplicatedFilename}";`
        )
        .replace(
            /log_corruption = [^;]*;/,
            `log_corruption = ${logCorruption};`
        )
        .replace(
            /rebuild_indexedlog = "[^"]*";/,
            `rebuild_indexedlog = "${rebuildIndexedlog}";`
        )
        .replace(
            /checkpoint_state = "[^"]*";/,
            `checkpoint_state = "${checkpointState.toUpperCase()}";`
        )
        .replace(
            /checkpoints_only_mfu = "[^"]*";/,
            `checkpoints_only_mfu = "${checkpointsOnlyMfu.toUpperCase()}";`
        )
        .replace(/num_mfu_tuples = [^;]*;/, `num_mfu_tuples = ${numMfuTuples};`)
        .replace(
            /number_checkpoints = [^;]*;/,
            `number_checkpoints = ${numberCheckpoints};`
        )
        .replace(
            /selftune_checkpoint_time_interval = "[^"]*";/,
            `selftune_checkpoint_time_interval = "${selftuneCheckpointTimeInterval.toUpperCase()}";`
        )
        .replace(
            /checkpoint_time_interval = [^;]*;/,
            `checkpoint_time_interval = ${checkpointTimeInterval};`
        )
        .replace(
            /first_checkpoint_start_time = [^;]*;/,
            `first_checkpoint_start_time = ${firstCheckpointStartTime};`
        )
        .replace(
            /stop_checkpoint_after_benchmark = "[^"]*";/,
            `stop_checkpoint_after_benchmark = "${stopCheckpointAfterBenchmark}";`
        )
        .replace(
            /display_checkpoint_information = "[^"]*";/,
            `display_checkpoint_information = "${displayCheckpointInformation}";`
        )
        .replace(
            /restart_daley_time = [^;]*;/,
            `restart_daley_time = ${restartDaleyTime};`
        )
        .replace(
            /restart_after_time = [^;]*;/,
            `restart_after_time = ${restartAfterTime};`
        )
        .replace(
            /number_restarts_after_time = [^;]*;/,
            `number_restarts_after_time = ${numberRestartsAfterTime};`
        )
        .replace(
            /preload_database_and_restart = [^;]*;/,
            `preload_database_and_restart = ${preloadDatabaseAndRestart};`
        )
        .replace(
            /number_restarts_after_preloading = [^;]*;/,
            `number_restarts_after_preloading = ${numberRestartsAfterPreloading};`
        )
        .replace(
            /memtier_benchmark_state = "[^"]*";/,
            `memtier_benchmark_state = "${memtierBenchmarkState.toUpperCase()}";`
        )
        .replace(
            /memtier_benchmark_workload_run_times = [^;]*;/,
            `memtier_benchmark_workload_run_times = ${memtierBenchmarkWorkloadRunTimes};`
        )
        .replace(
            /restart_after_bechmarking = [^;]*;/,
            `restart_after_bechmarking = ${restartAfterBenchmarking};`
        )
        .replace(
            /time_tostop_benchmarking = [^;]*;/,
            `time_tostop_benchmarking = ${timeTostopBenchmarking};`
        )
        .replace(
            /memtier_benchmark_parameters = "[^"]*";/,
            `memtier_benchmark_parameters = "${memtierBenchmarkParameters}";`
        )
        .replace(
            /generate_recovery_report = "[^"]*";/,
            `generate_recovery_report = "${generateRecoveryReport.toUpperCase()}";`
        )
        .replace(
            /recovery_report_filename = "[^"]*";/,
            `recovery_report_filename = "${recoveryReportFilename}";`
        )
        .replace(
            /generate_report_file_after_benchmarking = "[^"]*";/,
            `generate_report_file_after_benchmarking = "${generateReportFileAfterBenchmarking}";`
        )
        .replace(
            /generate_executed_commands_csv = "[^"]*";/,
            `generate_executed_commands_csv = "${generateExecutedCommandsCsv.toUpperCase()}";`
        )
        .replace(
            /executed_commands_csv_filename = "[^"]*";/,
            `executed_commands_csv_filename = "${executedCommandsCsvFilename}";`
        )
        .replace(
            /generate_indexing_report_csv = "[^"]*";/,
            `generate_indexing_report_csv = "${generateIndexingReportCsv.toUpperCase()}";`
        )
        .replace(
            /indexing_report_csv_filename = "[^"]*";/,
            `indexing_report_csv_filename = "${indexingReportCsvFilename}";`
        )
        .replace(
            /overwrite_report_files = "[^"]*";/,
            `overwrite_report_files = "${overwriteReportFiles.toUpperCase()}";`
        )
        .replace(
            /system_monitoring = "[^"]*";/,
            `system_monitoring = "${systemMonitoring.toUpperCase()}";`
        )
        .replace(
            /stop_system_monitoring_end_benckmark = "[^"]*";/,
            `stop_system_monitoring_end_benckmark = "${stopSystemMonitoringEndBenchmark.toUpperCase()}";`
        )
        .replace(
            /system_monitoring_csv_filename = "[^"]*";/,
            `system_monitoring_csv_filename = "${systemMonitoringCsvFilename}";`
        )
        .replace(
            /system_monitoring_time_interval = [^;]*;/,
            `system_monitoring_time_interval = ${systemMonitoringTimeInterval};`
        )
        .replace(
            /overwrite_system_monitoring = "[^"]*";/,
            `overwrite_system_monitoring = "${overwriteSystemMonitoring.toUpperCase()}";`
        );

    fs.writeFile(
        `${rootPath}/redis_ir.conf`,
        modifiedStringConf,
        function (err) {
            if (err) throw err;
            console.log("Configuração modificada e salva!");
        }
    );
}
