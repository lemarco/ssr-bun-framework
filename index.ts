import { server } from "./framework/server";

await server({
	port: 3000,
	routes: "./pages",
	base: "http://localhost:3000",
	dist: "./dist",
	watch: true,
});
