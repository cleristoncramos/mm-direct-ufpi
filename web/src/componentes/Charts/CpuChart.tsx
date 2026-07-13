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
    const baseOptions = chartModeList(chartMode, "CPU Usage");
    const chartOptions = {
        ...baseOptions,
        colors: ["#0284c7"], // Ocean blue line
        areaOpacity: 0.2, // Subtle area fill
        lineWidth: 1.5,
    };
    
    if (chartOptions.vAxis) {
        chartOptions.vAxis.viewWindow = { min: 0, max: 100 };
    }

    return (
        <div
            id="cpu_chart"
            className="mx-auto text-center pt-3 pb-1 bg-slate-900/60 backdrop-blur-md rounded-lg border border-slate-800"
        >
            <Chart
                chartType="AreaChart"
                options={chartOptions}
                data={chartData}
                width="100%"
                height={chartMode === "minimalist" ? "160px" : "220px"}
            />
        </div>
    );
};

export default CpuChart;

