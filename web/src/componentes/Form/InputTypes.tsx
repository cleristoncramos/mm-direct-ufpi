import { useState } from "react";

interface TextInputProps {
    TextName: string;
    TextPlaceholder: string;
    isDisable?: boolean;
    children?: React.ReactNode;
    value?: string;
}

interface CheckboxInputProps {
    CheckboxName: string;
    isDisable?: boolean;
    children?: React.ReactNode;
}

interface SwitchInputProps {
    SwitchName: string;
    onSwitchCheck?: any;
    isDisable?: boolean;
    children?: React.ReactNode;
    defaultChecked?: boolean;
}

interface RangeInputProps {
    RangeName: string;
    RangeDefault?: number;
    RangeMin?: number;
    RangeMax?: number;
    RangeSteps?: number;
    isDisable?: boolean;
    children?: React.ReactNode;
}

export const TextInput = ({
    TextName,
    TextPlaceholder,
    isDisable,
    children,
    value
}: TextInputProps) => {
    return (
        <div className="flex flex-col">
            <label
                htmlFor={`switch-${TextName}`}
                className="font-semibold text-sm"
            >
                {children}
            </label>
            <input
                type="text"
                name={TextName}
                id={`switch-${TextName}`}
                className="pl-3 h-2 p-0.5 basis-full rounded"
                placeholder={TextPlaceholder}
                disabled={isDisable}
                defaultValue={value}
            />
        </div>
    );
};

export const CheckboxInput = ({ CheckboxName, isDisable, children }: CheckboxInputProps) => {
    return (
        <div className="w-full">
            <label
                htmlFor={`switch-${CheckboxName}`}
                className="font-semibold align-middle"
            >
                <input
                    type="checkbox"
                    name={CheckboxName}
                    id={`switch-${CheckboxName}`}
                    className="form-checkbox ml-2 mr-2 mb-0.5 rounded cursor-pointer"
                    disabled={isDisable}
                />
                {children}
            </label>
        </div>
    );
};

export const SwitchInput = ({
    SwitchName,
    onSwitchCheck,
    isDisable,
    children,
    defaultChecked
}: SwitchInputProps) => {
    return (
        <div className="w-full">
            <label
                htmlFor={`switch-${SwitchName}`}
                className="font-semibold align-middle text-sm md:text-md "
            >
                <input
                    type="checkbox"
                    className="toggle -mr-2 mb-7"
                    name={SwitchName}
                    id={`switch-${SwitchName}`}
                    onClick={onSwitchCheck}
                    disabled={isDisable}
                    {
                    ...defaultChecked && { defaultChecked }
                    }
                />
                {children}
            </label>
        </div >
    );
};

export const RangeInput = ({
    RangeName,
    RangeDefault = 0,
    RangeMin = 0,
    RangeMax = 500,
    RangeSteps = 1,
    isDisable,
    children,
}: RangeInputProps) => {
    const [inputValue, setInputValue] = useState<string | number>(RangeDefault);
    return (
        <div>
            <label
                htmlFor={`switch-${RangeName}`}
                className="flex items-center font-semibold align-middle text-xs"
            >
                <div className="w-[10vw]">{children}</div>
                <input
                    type="range"
                    name={RangeName}
                    id={`switch-${RangeName}`}
                    className="w-full flex-auto ml-2 mr-3 h-2 rounded-lg cursor-pointer"
                    defaultValue={RangeDefault}
                    min={RangeMin}
                    max={RangeMax}
                    step={
                        RangeSteps & (RangeMin & RangeMax) &&
                            RangeSteps < RangeMax
                            ? RangeSteps
                            : 1
                    }
                    onInput={(e: any) => {
                        setInputValue(`${e.target.value}`);
                    }}
                    disabled={isDisable}
                />

                <div className="h-full w-20 rounded border-slate-500 border-2 grow-0 text-center align-bottom">
                    {inputValue}
                </div>
            </label>
        </div>
    );
};
