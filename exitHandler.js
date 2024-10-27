// exitHandler.js

const handlers = [];

function addExitHandler(handler, context) {
    handlers.push({ handler: handler, context: context });
}

function runHandlers() {
    handlers.forEach(function({ handler, context }) {
        try {
            handler.call(context);
        } catch (e) {
            console.error("Error executing exit handler:", e);
        }
    });
}

process.stdin.resume();

process.on("exit", runHandlers);
process.on("SIGINT", runHandlers);
process.on("SIGUSR1", runHandlers);
process.on("SIGUSR2", runHandlers);

module.exports = { addExitHandler };
