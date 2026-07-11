import { useState } from "react";
import IndexerOptions from "./IndexerOptions";
import CheckpointerOptions from "./CheckpointerOptions";
import FailureOptions from "./FailureOptions";
import MemtierOptions from "./MemtierOptions";
import ReportOptions from "./ReportOptions";
import SystemMonitoringOptions from "./SystemMonitoringOptions";
import ResetButton from "./ResetFormButton";
import StartButton from "./StartButton";
import systemMonitoringOptions from "./SystemMonitoringOptions";

const SetupForm = ({ submitFunction, resetFunction }: any) => {
    const [selectedPanel, setSelectedPanel] = useState<string>("indexeroptions");


    return (
        <form>
            <div className="grid grid-cols-6 gap-2 justify-center w-full pt-2 pb-1 px-4">
                <button id={IndexerOptions.name.toLowerCase()} className="w-full bg-slate-400 hover:bg-slate-500 focus:bg-slate-600 active:bg-slate-700 rounded-md font-mono font-semibold focus:underline " onClick={(e) => { e.preventDefault(); setSelectedPanel(e.currentTarget.id) }}>Indexer</button>
                <button id={CheckpointerOptions.name.toLowerCase()} className="w-full bg-slate-400 hover:bg-slate-500 focus:bg-slate-600 active:bg-slate-700 rounded-md font-mono font-semibold focus:underline " onClick={(e) => { e.preventDefault(); setSelectedPanel(e.currentTarget.id) }}>Checkpointer</button>
                <button id={FailureOptions.name.toLowerCase()} className="w-full bg-slate-400 hover:bg-slate-500 focus:bg-slate-600 active:bg-slate-700 rounded-md font-mono font-semibold focus:underline " onClick={(e) => { e.preventDefault(); setSelectedPanel(e.currentTarget.id) }}>Failure</button>
                <button id={MemtierOptions.name.toLowerCase()} className="w-full bg-slate-400 hover:bg-slate-500 focus:bg-slate-600 active:bg-slate-700 rounded-md font-mono font-semibold focus:underline " onClick={(e) => { e.preventDefault(); setSelectedPanel(e.currentTarget.id) }}>Memtier</button>
                <button id={ReportOptions.name.toLowerCase()} className="w-full bg-slate-400 hover:bg-slate-500 focus:bg-slate-600 active:bg-slate-700 rounded-md font-mono font-semibold focus:underline " onClick={(e) => { e.preventDefault(); setSelectedPanel(e.currentTarget.id) }}>Report</button>
                <button id={SystemMonitoringOptions.name.toLowerCase()} className="w-full bg-slate-400 hover:bg-slate-600 active:bg-slate-800 rounded-md font-mono font-semibold focus:underline text-sm" onClick={(e) => { e.preventDefault(); setSelectedPanel(e.currentTarget.id) }}>System Monitoring</button>
            </div>
            <div className="grid grid-cols-1 gap-x-3 justify-center items-center max-h-[75vh] min-h-[60vh]: md:max-h-full px-4 py-2 overflow-auto lg:overflow-hidden">
                <div className={selectedPanel.toLowerCase() == IndexerOptions.name.toLowerCase() ? "" : "hidden"}>
                    <IndexerOptions />
                </div>
                <div className={selectedPanel.toLowerCase() == CheckpointerOptions.name.toLowerCase() ? "" : "hidden"}>
                    <CheckpointerOptions />
                </div>
                <div className={selectedPanel.toLowerCase() == FailureOptions.name.toLowerCase() ? "" : "hidden"}>
                    <FailureOptions />
                </div>
                <div className={selectedPanel.toLowerCase() == MemtierOptions.name.toLowerCase() ? "" : "hidden"}>
                    <MemtierOptions />
                </div>
                <div className={selectedPanel.toLowerCase() == ReportOptions.name.toLowerCase() ? "" : "hidden"}>
                    <ReportOptions />
                </div>
                <div className={selectedPanel.toLowerCase() == systemMonitoringOptions.name.toLowerCase() ? "" : "hidden"}>
                    <SystemMonitoringOptions />
                </div>
            </div>
            <div className="flex flex-row justify-center gap-3 mt-3 px-4 pb-3 flex-wrap">
                <ResetButton onResetButtonClick={resetFunction} />
                <StartButton onClickButton={submitFunction} />
            </div>

        </form>
    )
}

export default SetupForm;