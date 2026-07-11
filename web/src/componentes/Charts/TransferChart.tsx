import { Chart } from "react-google-charts";
import { chartModeList } from "./ChartFunctions"
import Loading from "./Loading"

interface cpuChartProps {
    data: [number, number][];
    chartMode: "default" | "minimalist";
    failureTime?: number | null;
    recoveryStartTime?: number | null;
    recoveryEndTime?: number | null;
    stabilityTime?: number | null;
}

const TransactionChart = ({
    chartMode,
    data,
    failureTime = null,
    recoveryStartTime = null,
    recoveryEndTime = null,
    stabilityTime = null
}: cpuChartProps) => {
    if (data.length === 0) {
        return (
            <Loading />
        );
    }

    const headers = [
        "Timestamp",
        "Throughput",
        { role: "annotation" },
        { role: "annotationText" }
    ];

    const chartData = [
        headers,
        ...data.map((item) => {
            const time = item[0];
            const val = item[1];
            let annotation: string | null = null;
            let annotationText: string | null = null;

            if (failureTime !== null && time === failureTime) {
                annotation = "Falha";
                annotationText = "Instante da Falha Simulada";
            } else if (recoveryStartTime !== null && time === recoveryStartTime) {
                annotation = "Recuperação";
                annotationText = "Início da Recuperação";
            } else if (recoveryEndTime !== null && time === recoveryEndTime) {
                annotation = "Ativo";
                annotationText = "Fim da Recuperação (Banco Pronto)";
            } else if (stabilityTime !== null && time === stabilityTime) {
                annotation = "Estável";
                annotationText = "Retorno à Estabilidade";
            }

            return [time, val, annotation, annotationText];
        })
    ];

    const chartOptions = chartModeList(chartMode, "Throughput (Transações/Seg)");

    return (
        <div
            id="Transaction_chart"
            className="mx-auto text-center pt-3 pb-1 bg-slate-900/60 backdrop-blur-md rounded-lg border border-slate-800"
        >
            <Chart
                chartType="LineChart"
                options={chartOptions}
                data={chartData}
                width="100%"
                height={chartMode === "minimalist" ? "100px" : "280px"}
            />
        </div>
    );
};

export default TransactionChart;
