import { $ } from "bun";
import { watch } from "fs";
const router = new Bun.FileSystemRouter({
	style: "nextjs",
	dir: "./pages",
});
const template = await Bun.file("./index.html").text();
const base = "http://localhost:3000";

const fileMap = {};
const isClient = (input) => input.split("/").at(-1) === "client.ts";
const isServer = (input) => input.split("/").at(-1) === "index.ts";
const isLayout = (input) => input.split("/").at(-1) === "layout.ts";
const isDot = (input: string) => input === ".";

type RouteObj = {
	"client.ts"?: string;
	"index.ts"?: string;
	"layout.ts"?: string;
};
const getRelatedPath = (file: string) => {
	const splitted = file.split("/");
	const idx = splitted.findIndex((v) => v === "dist");
	if (idx !== -1) {
		for (let i = 0; i <= idx; i++) {
			splitted[i] = "";
		}
	}
	const scriptSrc = splitted.filter(Boolean).join("/");
	return scriptSrc;
};
const builder = async (input: string, outPath: string) => {
	const output = await Bun.build({
		entrypoints: [input],
		outdir: outPath,
		format: "esm",
		minify: true,
		naming: {
			entry: "[dir]/[name].[hash].[ext]",
		},
	});

	if (isClient(input)) {
		await Bun.write(
			output.outputs[0].path,
			(await Bun.file(output.outputs[0].path).text()).replace(
				/export{([a-zA-Z]) as client};/g,
				(_, letter) => `${letter}()`,
			),
		);
	} else {
		await Bun.write(
			output.outputs[0].path,
			(await Bun.file(output.outputs[0].path).text())
				.replace(/[\t\n]/g, "")
				.replaceAll('className=""', ""),
		);
	}

	const path = input.split("/").filter((v) => !isDot(v) && v !== "pages");
	if (path.length === 1) {
		if (isClient(input)) {
			const scriptSrc = getRelatedPath(output.outputs[0].path);

			fileMap[path[0]] = scriptSrc;

			return;
		}
		fileMap[path[0]] = output.outputs[0].path;
	} else {
		let link = fileMap;
		for (let i = 0; i < path.length; i++) {
			const isLast = path.length - 1 === i;
			const file = output.outputs[0].path;
			if (isLast) {
				if (isClient(input)) {
					const scriptSrc = getRelatedPath(file);

					link["client.ts"] = scriptSrc;
					return;
				}
				if (isServer(input)) {
					link["index.ts"] = file;
					return;
				}
				if (isLayout(input)) {
					link["layout.ts"] = file;
					return;
				}
			}
			if (!link[path[i]]) {
				link[path[i]] = {} as RouteObj;
			}
			link = link[path[i]];
		}
	}
};

const ls = async (path: string) => await $`ls ./${path}`.text();
const allNamesInFolder = async (path: string) => (await ls(path)).split("\n");

const isTsOrTsx = (file: string) =>
	file.endsWith(".tsx") || file.endsWith(".ts");

const filterTsFiles = (list: string[]) => list.filter(isTsOrTsx);
const filterFolders = (list: string[]) =>
	list.filter((file) => !isTsOrTsx(file));

const process = async (path = "./pages", outpath = "./dist") => {
	const list = (await allNamesInFolder(path)).filter(Boolean);
	if (list.length) {
		const jsFiles = filterTsFiles(list);
		for (const file of jsFiles) {
			await builder(`${path}/${file}`, `${outpath}`);
		}
		const folders = filterFolders(list);
		for (const folder of folders) {
			await $`mkdir -p ${outpath}/${folder}`;
			await process(`${path}/${folder}`, `${outpath}/${folder}`);
		}
	}
};

await process();

const watcher = watch(
	"./pages",
	{ recursive: true },
	async (event, filename) => {
		const splitted = filename?.split("/");
		// if (splitted?.at(-1) === "layout.ts") {
		// 	console.log("layout should be rebuilded");
		// }
		if (splitted) {
			splitted.pop();
			const outdir = splitted.join("/");
			await builder(`./pages/${filename}`, `./dist/${outdir}`);
			//console.log(`Detected ${event} in ${filename}`);
		}
	},
);

const buildTemplate = async (path: string[]) => {
	let currentTemplate = "";
	let link = fileMap;
	for (let i = 0; i < path.length; i++) {
		const chunk = path[i];
		const isInnerLayout = link[chunk] && link["layout.ts"];
		if (isInnerLayout) {
			const innerLayout = await (await import(link["layout.ts"])).server();
			if (currentTemplate) {
				currentTemplate = currentTemplate.replace("<!--slot-->", innerLayout);
			} else {
				currentTemplate = innerLayout;
			}
		}

		link = link[chunk];
	}
	return currentTemplate;
};
const getPageFiles = async (path: string[]) => {
	let link = fileMap;
	const clientScripts: string[] = [];
	let currentPath = "";
	for (const chunk of path) {
		currentPath += chunk;
		if (link["client.ts"]) {
			clientScripts.push(link["client.ts"]);
		}
		if (!link[chunk] || chunk.endsWith(".ts")) {
			return {
				clientScripts,
				server: link["index.ts"]
					? await (await import(link["index.ts"])).server()
					: "",
			};
		}
		link = link[chunk];
	}
	return null;
};

Bun.serve({
	port: 3000,
	async fetch(req) {
		const replaced = req.url.replace(base, "");
		const path = router.match(replaced || "/");

		if (path) {
			//@ts-ignore
			const splittedPath = path.scriptSrc.split("/");
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			const data = await getPageFiles(splittedPath)!;
			if (data) {
				const { clientScripts, server } = data;
				const layout = await buildTemplate(splittedPath);
				const replacedLayout = layout.replace("<!--slot-->", server);
				const scriptsWrapped =
					clientScripts
						.map((client) => `<script src=${base}/${client} defer></script>`)
						.join("") || "";

				const html = template
					// .replace("<!--app-head-->", rendered.head ?? "")
					.replace("<!--app-html-->", replacedLayout ?? "")
					.replace("<!--app-client-->", scriptsWrapped);
				return new Response(html, { headers: { "Content-type": "text/html" } });
			}
		}
		if (req.url.endsWith(".js")) {
			req.url.split("/");
			const file = await Bun.file(`./dist${replaced}`).text();

			return new Response(file, {
				headers: { "Content-type": "application/javascript" },
			});
		}
		req.referrer;
		return new Response("404!");
	},
});
