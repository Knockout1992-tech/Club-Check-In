
(function () {

    const entries = [];
    const MAX_ENTRIES = 100;

    function format(value) {
        if (value instanceof Error) {
            return value.stack || value.message;
        }

        if (typeof value === "string") {
            return value;
        }

        if (typeof value === "undefined") {
            return "undefined";
        }

        try {
            const result = JSON.stringify(value);
            return result === undefined
                ? String(value)
                : result;
        } catch (_) {
            return String(value);
        }
    }

    function panel() {
        let element =
            document.getElementById("clubCheckInDebugPanel");

        if (element) return element;

        element = document.createElement("div");
        element.id = "clubCheckInDebugPanel";
        element.style.display = "none";

        Object.assign(element.style, {
            position: "fixed",
            top: "6px",
            right: "6px",
            width: "min(94vw, 440px)",
            maxHeight: "32vh",
            overflowY: "auto",
            background: "#111",
            color: "#fff",
            border: "3px solid #ff3030",
            borderRadius: "8px",
            padding: "10px",
            zIndex: "2147483647",
            font: "12px monospace",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            boxSizing: "border-box"
        });

        const header = document.createElement("div");

        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";
        header.style.gap = "8px";

        const heading = document.createElement("strong");
        heading.textContent = "CLUB CHECK-IN DIAGNOSTICS";

        const controls = document.createElement("div");

        const clear = document.createElement("button");
        clear.type = "button";
        clear.textContent = "Clear";

        clear.onclick = function () {
            entries.length = 0;
            render();
        };

        const hide = document.createElement("button");
        hide.type = "button";
        hide.textContent = "Hide";
        hide.style.marginLeft = "6px";

        hide.onclick = function () {
            element.style.display = "none";
        };

        controls.append(clear, hide);
        header.append(heading, controls);

        const output = document.createElement("div");
        output.id = "clubCheckInDebugOutput";
        output.style.marginTop = "8px";

        element.append(header, output);
        document.body.appendChild(element);

        return element;
    }

    function render() {
        const element = panel();

        const output = element.querySelector(
            "#clubCheckInDebugOutput"
        );

        output.textContent = entries.join("\n\n");
        element.scrollTop = element.scrollHeight;
    }

    function log() {
        const message = Array.from(arguments)
            .map(format)
            .join(" ");

        entries.push(
            new Date().toLocaleTimeString() +
            " | " +
            message
        );

        if (entries.length > MAX_ENTRIES) {
            entries.shift();
        }

        console.log("[CLUB CHECK-IN]", message);
        render();
    }

    function reportError(where, error) {
        log("ERROR |", where, "|", error);
    }

    window.clubCheckInDiagnostics = {
        log: log,
        error: reportError,

        warn: function () {
            log("WARNING |", ...arguments);
        },

        info: function () {
            log("INFO |", ...arguments);
        },

        section: function (name) {
            log("==========", name, "==========");
        },

        clear: function () {
            entries.length = 0;
            render();
        },

        show: function () {
            render();
        },

        hide: function () {
            const element = document.getElementById(
                "clubCheckInDebugPanel"
            );

            if (element) {
                element.style.display = "none";
            }
        }
    };

    window.addEventListener("error", function (event) {
        log(
            "WINDOW ERROR |",
            event.message,
            "| File:",
            event.filename,
            "| Line:",
            event.lineno,
            "| Column:",
            event.colno,
            "| Details:",
            event.error
        );
    });

    window.addEventListener("unhandledrejection", function (event) {
        log("UNHANDLED PROMISE REJECTION |", event.reason);
    });

    window.addEventListener("DOMContentLoaded", function () {
        log("Diagnostic listeners installed.");
    });

    log("General diagnostic system loaded.");

})();
