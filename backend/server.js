require("dotenv").config();
const markOfflineWorkers = require("./src/services/workerMonitor");
setInterval(markOfflineWorkers, 15000);

const app = require("./src/app");
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});