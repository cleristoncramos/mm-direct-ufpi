import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, registerables, ChartOptions } from "chart.js";
import Loading from "./Loading";

try {
    ChartJS.register(...registerables);
} catch (e) {
    console.error("Error registering ChartJS in CpuChart", e);
}

interface cpuChartProps {
    chartMode: "default" | "minimalist";
    selectedChart?: boolean;
    data: [number, number][];
}

const CpuChart = ({ chartMode, data }: cpuChartProps) => {
    if (data.length === 0) {
        return <Loading />;
    }

    // Ordena os dados pelo tempo (eixo x) para evitar linhas diagonais confusas
    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => a[0] - b[0]);
    }, [data]);

    const chartData = useMemo(() => {
        return {
            datasets: [
                {
                    label: "Uso de CPU",
                    data: sortedData.map((item) => ({ x: item[0], y: item[1] })),
                    borderColor: "#0284c7", // Ocean blue
                    backgroundColor: "rgba(2, 132, 199, 0.15)", // Subtle area fill
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    fill: true,
                    tension: 0.2,
                }
            ]
        };
    }, [sortedData]);

    const chartOptions = useMemo<ChartOptions<"line">>(() => {
        const isMinimal = chartMode === "minimalist";
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear" as const,
                    display: !isMinimal,
                    grid: { color: "#334155" },
                    ticks: { color: "#94a3b8" }
                },
                y: {
                    display: !isMinimal,
                    min: 0,
                    max: 100,
                    grid: { color: "#334155" },
                    ticks: { color: "#94a3b8" }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: !isMinimal }
            }
        };
    }, [chartMode]);

    return (
        <div
            id="cpu_chart"
            className="w-full h-[160px] pt-2 pb-1 bg-slate-900/40 rounded-lg border border-slate-800/80"
        >
            <Line data={chartData} options={chartOptions} />
        </div>
    );
};

export default CpuChart;
