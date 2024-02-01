import { $ } from "bun";
import { watch } from "fs";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { builder, fileMap } from "./builder";
import {
	allNamesInFolder,
	filterFolders,
	filterTsFiles,
	getAllPagesPaths,
	isDynamicFolder,
	isFile,
	isGroup,
	isParallel,
	splitUrl,
} from "./utils";
import { FileSystemRouter } from "./router";
import { watcher } from "./watcher";

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

const startBuild = async (path = "./pages", outpath = "./dist") => {
	const list = (await allNamesInFolder(path)).filter(Boolean);
	if (list.length) {
		const jsFiles = filterTsFiles(list);
		for (const file of jsFiles) {
			await builder(`${path}/${file}`, `${outpath}`);
		}
		const folders = filterFolders(list);
		for (const folder of folders) {
			await $`mkdir -p ${outpath}/${folder}`;
			await startBuild(`${path}/${folder}`, `${outpath}/${folder}`);
		}
	}
};
type ServerArgs = {
	port: number;
	routes?: string;
	base?: string;
	dist?: string;
	watch?: boolean;
};

const getExtension = (path) => path.split("/").at(-1);
const isJs = (ext) => ext === ".js";
const getScript = (replaced: string) => {};
export const server = async ({
	port,
	routes: dir = "./pages",
	dist = "./dist",
	base = "http://localhost:3000",
	watch = false,
}: ServerArgs) => {
	const router = new FileSystemRouter({
		base,
		dir,
	});
	const template = await Bun.file("./index.html").text();
	await startBuild(dir, dist);
	if (watch) {
		watcher({ dir, dist });
	}
	Bun.serve({
		port,
		async fetch(req) {
			const replaced = req.url.replace(base, "");
			const ext = getExtension(replaced);
			if (ext) {
				if (isJs(ext)) {
					getScript(replaced);
					// куегкт
				}
			}
			const res = router.match(replaced || "/");
			console.log(res);
			// if (path) {
			// 	//@ts-ignore
			// 	const splittedPath = path.scriptSrc.split("/");
			// 	// biome-ignore lint/style/noNonNullAssertion: <explanation>
			// 	const data = await getPageFiles(splittedPath)!;
			// 	if (data) {
			// 		const { clientScripts, server } = data;
			// 		const layout = await buildTemplate(splittedPath);
			// 		const replacedLayout = layout.replace("<!--slot-->", server);
			// 		const scriptsWrapped =
			// 			clientScripts
			// 				.map((client) => `<script src=${base}/${client} defer></script>`)
			// 				.join("") || "";

			// 		const html = template
			// 			// .replace("<!--app-head-->", rendered.head ?? "")
			// 			.replace("<!--app-html-->", replacedLayout ?? "")
			// 			.replace("<!--app-client-->", scriptsWrapped);
			// 		return new Response(html, {
			// 			headers: { "Content-type": "text/html" },
			// 		});
			// 	}
			// }
			// if (req.url.endsWith(".js")) {
			// 	req.url.split("/");
			// 	const file = await Bun.file(`./dist${replaced}`).text();

			// 	return new Response(file, {
			// 		headers: { "Content-type": "application/javascript" },
			// 	});
			// }
			req.referrer;
			return new Response("404!");
		},
	});
};
