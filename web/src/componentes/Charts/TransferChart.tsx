import { Line } from "react-chartjs-2";
import { Chart as ChartJS, registerables, ChartOptions } from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import Loading from "./Loading";

ChartJS.register(...registerables, annotationPlugin);

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
    recoveryEndTime = null
}: cpuChartProps) => {
    if (data.length === 0) {
        return <Loading />;
    }

    // Convert data to format required by Chart.js (objects with x and y keys)
    const chartPoints = data.map((item) => ({
        x: item[0],
        y: item[1]
    }));

    const failT = failureTime ?? recoveryStartTime ?? Infinity;
    const recEnd = recoveryEndTime ?? Infinity;

    const chartData = {
        datasets: [
            {
                label: "Throughput",
                data: chartPoints,
                borderColor: "#3b82f6", // Default fallback color
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.15, // Smooth line representation
                fill: false,
                segment: {
                    borderColor: (ctx: any) => {
                        if (ctx.p1) {
                            const xVal = ctx.p1.parsed.x;
                            if (xVal >= failT && xVal <= recEnd) {
                                return "#f59e0b"; // Orange during recovery
                            } else if (xVal > recEnd) {
                                return "#10b981"; // Green post-recovery (stability)
                            }
                        }
                        return "#3b82f6"; // Blue during normal operation
                    }
                }
            }
        ]
    };

    const isMinimalist = chartMode === "minimalist";

    // Detect recovery zone coordinates
    const recZoneStart = recoveryStartTime ?? failureTime;
    const recZoneEnd = recoveryEndTime;

    const chartOptions: ChartOptions<"line"> = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: "linear",
                display: !isMinimalist,
                grid: {
                    color: "#334155" // slate-700
                },
                ticks: {
                    color: "#94a3b8", // slate-400
                    font: {
                        family: "Inter, monospace",
                        size: 10
                    }
                },
                title: {
                    display: true,
                    text: "Tempo (s)",
                    color: "#cbd5e1", // slate-300
                    font: {
                        family: "Inter, monospace",
                        size: 11,
                        weight: "bold"
                    }
                }
            },
            y: {
                display: !isMinimalist,
                grid: {
                    color: "#334155" // slate-700
                },
                ticks: {
                    color: "#94a3b8", // slate-400
                    font: {
                        family: "Inter, monospace",
                        size: 10
                    }
                },
                title: {
                    display: true,
                    text: "Throughput (ops/s)",
                    color: "#cbd5e1", // slate-300
                    font: {
                        family: "Inter, monospace",
                        size: 11,
                        weight: "bold"
                    }
                }
            }
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                enabled: !isMinimalist,
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                titleColor: "#ffffff",
                bodyColor: "#cbd5e1",
                borderColor: "#334155",
                borderWidth: 1,
                titleFont: {
                    family: "Inter, sans-serif",
                    size: 11
                },
                bodyFont: {
                    family: "Inter, monospace",
                    size: 11
                },
                callbacks: {
                    title: (context) => `Tempo: ${context[0].parsed.x}s`,
                    label: (context) => `Throughput: ${(context.parsed.y ?? 0).toLocaleString("pt-BR")} ops/s`
                }
            },
            annotation: {
                annotations: {
                    // Vertical red dashed line at the moment of failure
                    ...(failureTime !== null ? {
                        linhaFalha: {
                            type: "line" as const,
                            scaleID: "x",
                            value: failureTime,
                            borderColor: "#ef4444",
                            borderWidth: 2,
                            borderDash: [6, 6],
                            label: {
                                content: "Falha do Sistema",
                                display: true,
                                position: "start" as const,
                                backgroundColor: "rgba(239, 68, 68, 0.85)",
                                color: "#ffffff",
                                padding: { top: 4, bottom: 4, left: 6, right: 6 },
                                font: {
                                    size: 10,
                                    family: "Inter, sans-serif",
                                    weight: "bold"
                                }
                            }
                        }
                    } : {}),
                    // Shaded yellow/orange area for recovery period
                    ...(recZoneStart !== null && recZoneEnd !== null ? {
                        zonaRecuperacao: {
                            type: "box" as const,
                            xMin: recZoneStart,
                            xMax: recZoneEnd,
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            borderColor: "transparent",
                            label: {
                                content: "Recuperação",
                                display: true,
                                position: "center" as const,
                                color: "#f59e0b",
                                font: {
                                    size: 11,
                                    family: "Inter, sans-serif",
                                    weight: "bold"
                                }
                            }
                        }
                    } : {})
                }
            }
        }
    };

    return (
        <div
            id="Transaction_chart"
            className="mx-auto text-center pt-3 pb-1 bg-slate-900/60 backdrop-blur-md rounded-lg border border-slate-800"
        >
            <div style={{ height: chartMode === "minimalist" ? "100px" : "280px" }}>
                <Line
                    options={chartOptions}
                    data={chartData}
                    width="100%"
                />
            </div>
        </div>
    );
};

export default TransactionChart;

