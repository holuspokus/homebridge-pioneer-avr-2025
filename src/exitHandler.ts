// src/exitHandler.ts

const handlers: Array<{ handler: () => void; context: any }> = [];

/**
 * Adds an exit handler function with an optional context.
 * @param handler - The handler function to execute on exit.
 * @param context - The context to bind the handler function to.
 */
export function addExitHandler(handler: () => void, context: any) {
    handlers.push({ handler, context });
}

/**
 * Runs all registered exit handlers in their respective contexts.
 */
function runHandlers() {
    handlers.forEach(({ handler, context }) => {
        try {
            handler.call(context);
        } catch (e) {
            console.error("Error executing exit handler:", e);
        }
    });
}

// Keep the process alive by listening to stdin
process.stdin.resume();

// Bind the exit handler to various termination signals
process.on("exit", runHandlers);
process.on("SIGINT", runHandlers);
process.on("SIGUSR1", runHandlers);
process.on("SIGUSR2", runHandlers);
