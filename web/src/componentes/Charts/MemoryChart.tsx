import { Chart } from "react-google-charts";
import { chartModeList } from "./ChartFunctions"
import Loading from "./Loading"

interface cpuChartProps {
  data: [number, number][];
  chartMode: "default" | "minimalist"
}

const MemoryChart = ({chartMode , data }: cpuChartProps) => {
  if (data.length === 0) {
    return (
      <Loading />
    );
  }

  const chartData = [["Timestamp ", "Memory Usage (MB)"], ...data];
  const chartOptions = chartModeList(chartMode, "Memory Usage (MB)");

  return (
    <div
      id="Memory_chart"
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

export default MemoryChart;
