module.exports = async () => {
  const child = globalThis.__CONTRACT_API__;
  if (!child) return;
  await new Promise((resolve) => {
    child.on("exit", resolve);
    child.kill("SIGTERM"); // the server closes and drops its throwaway database
    setTimeout(resolve, 15000);
  });
};
