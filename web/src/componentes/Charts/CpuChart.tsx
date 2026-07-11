import { Chart } from "react-google-charts";
import { chartModeList } from "./ChartFunctions"
import Loading from "./Loading"

interface cpuChartProps {
    chartMode: "default" | "minimalist";
    selectedChart?: boolean;
    data: [number, number][]
}

const CpuChart = ({ chartMode, data }: cpuChartProps) => {
    if (data.length === 0) {
        return (
            <Loading />
        );
    }

    const chartData = [["Timestamp", "CPU Usage"], ...data];
    const chartOptions = chartModeList(chartMode, "CPU Usage");
    if (chartOptions.vAxis) {
        chartOptions.vAxis.viewWindow = { min: 0, max: 100 };
    }

    return (
        <div
            id="cpu_chart"
            className="mx-auto text-center pt-3 pb-1 bg-slate-900/60 backdrop-blur-md rounded-lg border border-slate-800"
        >
            <Chart
                chartType="LineChart"
                options={chartOptions}
                data={chartData}
                width="100%"
                height={chartMode === "minimalist" ? "100px" : "220px"}
            />
        </div>
    );
};

export default CpuChart;

