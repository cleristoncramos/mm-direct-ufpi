import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, registerables, ChartOptions } from "chart.js";
import Loading from "./Loading";

try {
    ChartJS.register(...registerables);
} catch (e) {
    console.error("Error registering ChartJS in MemoryChart", e);
}

interface memoryChartProps {
    data: [number, number][];
    chartMode: "default" | "minimalist";
}

const MemoryChart = ({ chartMode, data }: memoryChartProps) => {
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
                    label: "Uso de Memória RAM",
                    data: sortedData.map((item) => ({ x: item[0], y: item[1] })),
                    borderColor: "#6366f1", // Indigo
                    backgroundColor: "rgba(99, 102, 241, 0.15)", // Subtle area fill
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
            id="Memory_chart"
            className="w-full h-[160px] pt-2 pb-1 bg-slate-900/40 rounded-lg border border-slate-800/80"
        >
            <Line data={chartData} options={chartOptions} />
        </div>
    );
};

export default MemoryChart;
