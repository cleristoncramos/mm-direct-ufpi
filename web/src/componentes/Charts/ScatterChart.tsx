import { Chart } from "react-google-charts";
import { chartModeList } from "./ChartFunctions";
import Loading from "./Loading";

interface ScatterChartProps {
  data: [number, number | null, number | null][];
  chartMode?: "default" | "minimalist";
}

export const ScatterChart = ({ chartMode = "default", data }: ScatterChartProps) => {
  if (data.length === 0) {
    return <Loading />;
  }

  const chartData = [
    ['Time', 'Normal', 'Anormal'],
    ...data
  ];

  const chartOptions = chartModeList(chartMode, "Latência Média (μs)");
  chartOptions.colors = ["#3b82f6", "#f43f5e"]; // Blue for normal, red/rose for abnormal

  return (
    <div
      id="Latency_chart"
      className="mx-auto text-center pt-3 pb-1 bg-slate-900/60 backdrop-blur-md rounded-lg border border-slate-800"
    >
      <Chart  
        chartType="LineChart"
        data={chartData}
        options={chartOptions}
        width="100%"
        height={chartMode === "minimalist" ? "160px" : "220px"}
      />
    </div>
  );
};