import { resolve } from "path";

const router = new Bun.FileSystemRouter({
	style: "nextjs",
	dir: "./pages",
});
const template = await Bun.file("./index.html").text();
const base = "http://localhost:3000/";
Bun.serve({
	port: 3000,
	async fetch(req) {
		console.log("req.url = ", req.url.replace(base, "") || "/");

		const path = router.match(req.url.replace(base, "") || "/");
		console.log(path);
		if (path?.pathname) {
			const layoutFile = path.filePath.replace("index.ts", "layout.ts");
			console.log("layoutFile=", layoutFile);
			const pageFile = path.filePath;
			console.log("pageFile=", pageFile);
			const { server: layout, client: clientLayout } = await import(layoutFile);
			if (layout) {
				console.log("layout found");
			}
			const { server, client } = await import(pageFile);
			if (layout) {
				console.log("page found");
			}
			const rendered = await server();
			//console.log("server= ", rendered);
			const withTemplate = layout().replace("<!--slot-->", rendered);
			const html = template
				// .replace("<!--app-head-->", rendered.head ?? "")
				.replace("<!--app-html-->", withTemplate ?? "")
				.replace(
					"<!--app-client-->",
					client ? `<script>(${client.toString()})()</script>` : "",
				);

			//console.log(html);
			return new Response(html, { headers: { "Content-type": "text/html" } });
		}
		return new Response("huy!");
	},
});
// <script type="module" src="/src/entry-client.ts"></script>
