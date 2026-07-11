import OptionsBoard from "./OptionsBoard";
import { SwitchInput, RangeInput } from "./InputTypes";

const CheckpointerOptions = () => {
    return (
        <OptionsBoard BoardHeader="Checkpointer">
            <div className="flex justify-around">
                <SwitchInput SwitchName="checkpointState">
                    Checkpoint
                </SwitchInput>
                <SwitchInput SwitchName="checkpointsOnlyMfu">
                    Only MFU
                </SwitchInput>
            </div>
            <RangeInput RangeName="numberCheckpoints">
                Checkpoints quantity
            </RangeInput>
            <RangeInput RangeName="checkpointTimeInterval">
                Time interval
            </RangeInput>
            <SwitchInput SwitchName="selftuneCheckpointTimeInterval">
                Self tune time interval
            </SwitchInput>
        </OptionsBoard>
    )
}

export default CheckpointerOptions;