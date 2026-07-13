import OptionsBoard from "./OptionsBoard";
import { TextInput, SwitchInput, RangeInput } from "./InputTypes";

const IndexerOptions = () => {
    return (
        <OptionsBoard BoardHeader="Indexer">
            <div className="flex justify-around">
                <SwitchInput SwitchName="instantRecoveryState" defaultChecked>
                    Instant Recovery
                </SwitchInput>
                <SwitchInput SwitchName="instantRecoverySynchronous">
                    Synchronous
                </SwitchInput>
            </div>
            <TextInput
                TextName="aofFilename"
                TextPlaceholder="arquivo.aof"
                value="logs/sequentialLog.aof"
            >
                AOF filename
            </TextInput>
            <TextInput
                TextName="indexedlogFilename"
                TextPlaceholder="arquivo.txt"
                value="logs/indexedLog.db"
            >
                indexed log filename
            </TextInput>
            <RangeInput RangeName="indexerTimeInterval">
                Time interval
            </RangeInput>
        </OptionsBoard>
    )
}

export default IndexerOptions;