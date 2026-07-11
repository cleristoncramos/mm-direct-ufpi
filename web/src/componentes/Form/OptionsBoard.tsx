const OptionsBoard = ({ children, BoardHeader }: any) => {
    return (
        <div className="h-fit w-full sm:w-[90vw] md:w-full max-w-xl sm:max-w-lg md:max-w-2xl  pt-3 pb-6 px-7 mx-auto my-3 space-y-5 bg-slate-50 rounded-lg shadow-md text-slate-800">
            <h3 className="font-bold text-center text-2xl">{BoardHeader}</h3>
            {children}
        </div>
    );
};

export default OptionsBoard;
