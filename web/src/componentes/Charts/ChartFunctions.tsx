import { GoogleChartOptions } from "react-google-charts"

export const chartModeList = (mode = "default", title: string): GoogleChartOptions => {
    const baseOptions: GoogleChartOptions = {
        backgroundColor: "transparent",
        chartArea: {
            width: "90%",
            height: "75%",
            top: "12%",
            left: "7%"
        },
        titleTextStyle: {
            color: "#cbd5e1", // slate-300
            fontSize: 14,
            fontName: "Inter, monospace",
            bold: true
        },
        hAxis: {
            textStyle: { color: "#94a3b8", fontSize: 10, fontName: "Inter, monospace" },
            gridlines: { color: "#334155", count: 10 }, // slate-700
            minorGridlines: { color: "transparent" }
        },
        vAxis: {
            textStyle: { color: "#94a3b8", fontSize: 10, fontName: "Inter, monospace" },
            gridlines: { color: "#334155" },
            minorGridlines: { color: "transparent" }
        },
        legend: {
            position: "bottom",
            textStyle: { color: "#cbd5e1", fontSize: 11, fontName: "Inter, monospace" }
        },
        annotations: {
            style: "line",
            line: {
                color: "#f43f5e", // rose-500
                width: 2
            },
            textStyle: {
                color: "#f8fafc", // slate-50
                fontSize: 10,
                fontName: "Inter, monospace",
                bold: true
            }
        }
    };

    const modes: Record<string, GoogleChartOptions> = {
        default: {
            ...baseOptions,
            title,
            curveType: "function",
            colors: ["#3b82f6", "#10b981", "#f43f5e"] // blue, emerald, rose
        },
        minimalist: {
            ...baseOptions,
            title,
            chartArea: {
                width: "95%",
                height: "85%",
                top: "10%",
                left: "5%"
            },
            hAxis: {
                textPosition: "none",
                gridlines: { color: "transparent" },
                minorGridlines: { color: "transparent" }
            },
            vAxis: {
                textPosition: "none",
                gridlines: { color: "transparent" },
                minorGridlines: { color: "transparent" }
            },
            legend: "none",
            enableInteractivity: false
        }
    };

    return modes[mode] || modes.default;
}