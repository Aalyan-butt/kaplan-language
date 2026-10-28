import { createApp } from "./main.js";
const port = Number(process.env.PORT || 3000);
createApp().listen(port, (error) => {
  if (error) {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is already in use. Stop the existing server before starting Kaplan.`
        : `Kaplan could not start (${error.code || "server error"}).`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Kaplan is running at http://localhost:${port}`);
});
