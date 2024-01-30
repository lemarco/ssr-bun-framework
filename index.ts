import { resolve } from "path";
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
			fileMap[path[0]] = await Bun.file(output.outputs[0].path).text();
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
					link["client.ts"] = await Bun.file(file).text();
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
	//console.log(`list in path = ${path} and list = ${list}`);
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
		if (splitted?.at(-1) === "layout.ts") {
			console.log("layout should be rebuilded");
		}
		if (splitted) {
			splitted.pop();
			const outdir = splitted.join("/");
			await builder(`./pages/${filename}`, `./dist/${outdir}`);

			console.log(`Detected ${event} in ${filename}`);
		}
	},
);

const buildTemplate = async (path: string[]) => {
	let currentTemplate = "";

	let link = fileMap;

	for (let i = 0; i < path.length; i++) {
		const chunk = path[i];
		// console.log("--------------------------");
		// console.log("chunk=", chunk);
		// console.log("--------------------------");
		const isInnerLayout = link[chunk] && link["layout.ts"];
		// console.log("isInnerLayout=", isInnerLayout);
		if (isInnerLayout) {
			const innerLayout = await (await import(link["layout.ts"])).server();
			// console.log("innerLayout = ", innerLayout);
			// console.log("--------------------------");
			// console.log("currentTemplate = ", currentTemplate);
			if (currentTemplate) {
				currentTemplate = currentTemplate.replace("<!--slot-->", innerLayout);
			} else {
				currentTemplate = innerLayout;
			}
			// console.log("--------------------------");
			// console.log("currentTemplate after replace = ", currentTemplate);
		}

		link = link[chunk];
	}
	return currentTemplate;
};
const getPageFiles = async (path: string[]) => {
	let link = fileMap;
	const clientScripts: string[] = [];
	for (const chunk of path) {
		if (link["client.ts"]) {
			console.log("there is client script");
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
// console.log("fileMap= ", fileMap);
Bun.serve({
	port: 3000,
	async fetch(req) {
		//console.log("req.url = ", req.url.replace(base, "") || "/");

		const path = router.match(req.url.replace(base, "") || "/");
		//console.log(path);

		if (path) {
			//@ts-ignore
			const splittedPath = path.scriptSrc.split("/");
			// console.log("splittedPath =", splittedPath);
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			const data = await getPageFiles(splittedPath)!;
			if (data) {
				const { clientScripts, server } = data;
				const layout = await buildTemplate(splittedPath);
				const replacedLayout = layout.replace("<!--slot-->", server);
				// console.log("server = ", server);
				// console.log("layout = ", layout);
				// console.log("replacedLayout = ", replacedLayout);
				// console.log("client= ", client);
				const scriptsWrapped =
					clientScripts
						.map((client) => `<script>${client}</script>`)
						.join("") || "";
				console.log("length = ", scriptsWrapped.length);
				console.log("scriptsWrapped= ", scriptsWrapped);
				const html = template
					// .replace("<!--app-head-->", rendered.head ?? "")
					.replace("<!--app-html-->", replacedLayout ?? "")
					.replace("<!--app-client-->", scriptsWrapped);
				return new Response(html, { headers: { "Content-type": "text/html" } });
			}

			// const searchString = "pages/";
			// const index = path.filePath.indexOf(searchString);
			// console.log("index = ", index);
			// if (index !== -1) {
			// 	const resultString = path?.pathname.substring(
			// 		index + searchString.length,
			// 	);
			// 	console.log("resultString = ", resultString);
			// }
			// const pathToDist = path.filePath.replace("pages", "dist");
			// console.log("pathToDist = ", pathToDist);

			// const layoutFile = pathToDist.replace("index.ts", "layout.js");
			// const pageFile = pathToDist.replace(".ts", ".js");
			// const clientFile = pathToDist.replace("index.ts", "client.js");
			// const { server: layout } = await import(layoutFile);
			// const { server: page } = await import(pageFile);
			// const client = await Bun.file(clientFile).text();
			// const rendered = await page();
			// const withTemplate = layout().replace("<slot />", rendered);

			// const html = template
			// 	// .replace("<!--app-head-->", rendered.head ?? "")
			// 	.replace("<!--app-html-->", withTemplate ?? "")
			// 	.replace(
			// 		"<!--app-client-->",
			// 		client ? `<script>${client.toString()}</script>` : "",
			// 	);

			// // console.log(html);
			// return new Response(html, { headers: { "Content-type": "text/html" } });
		}
		return new Response("404!");
	},
});
// <script type="module" src="/src/entry-client.ts"></script>
