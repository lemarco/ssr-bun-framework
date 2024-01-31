import { $ } from "bun";
import { watch } from "fs";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
type FileSystemRouterArgs = {
	dir?: string;
	base?: string;
};

const FileTypes = [
	"layout.ts",
	"client.ts",
	"page.ts",
	"loader.ts",
	"error.ts",
] as const;
const FolderTypes = ["[", "(", "@"] as const;
const isGroup = (url: string) => url.startsWith("(");
const isParallel = (url: string) => url.startsWith("@");
const isRootFile = (splitted: string[]) => splitted.length === 1;
const isFolder = (file: string) => !file.endsWith(".ts");
const isDynamicFolder = (file: string) =>
	isFolder(file) && FolderTypes.some((prefix) => file.startsWith(prefix));
const isFile = (file: string) => file.endsWith(".ts");
const isFileToMatch = (file: string) =>
	isFile(file) && FileTypes.some((type) => file === type);
const removeBase = (url: string, base: string) => url.replace(base, "");
const splitUrl = (url: string) => url.split("/");
const removeBaseAndSplit = (url: string, base: string) =>
	splitUrl(removeBase(url, base)).filter(Boolean);
const getAllFilesPaths = (dir = "./pages") =>
	readdirSync(dir, { recursive: true });
type NewNodeArgs = {
	name: string;
	isLeaf?: boolean;
	clients?: string[];
	layouts?: string[];
	path?: string;
};
type Scripts = {
	currentLayoutScripts: string[];
	currentClientScripts: string[];
	path: string;
};
class Node {
	name: string;
	isLeaf?: boolean;

	static?: Map<string, Node>;
	parallel?: Map<string, Node>;
	group?: Map<string, Node>;
	dynamic?: [string, Node];

	clients?: string[];
	layouts?: string[];
	path?: string;
	constructor({ isLeaf, path, name, clients, layouts }: NewNodeArgs) {
		this.isLeaf = isLeaf;
		this.name = name;
		this.clients = clients;
		this.layouts = layouts;
		this.path = path;
	}
	find(urlSegments: string[], idx: number) {
		//@ts-ignore
		if (this.static) {
			for (const node of this.static) {
				if (node.name === urlSegments[idx]) {
					if (urlSegments.length - 1 === idx) {
						if (node.isLeaf) {
							return node;
						}
						return node.find(["page.ts"], 0);
					}

					const matchResult = node.find(urlSegments, idx + 1);
					if (matchResult) {
						return matchResult;
					}
				}
			}
		}
		//@ts-ignore
		for (const node of this.group) {
			const matchResult = node.find(urlSegments, idx);
			if (matchResult) {
				return matchResult;
			}
		}
		//@ts-ignore
		return this.dynamic.find(urlSegments, idx + 1);
	}
	add(urlSegments: string[], idx: number, scripts: Scripts) {
		//console.log("scripts = ", scripts);
		//console.log("URL SEGMENT = " + urlSegments[idx]);
		const currentPart = urlSegments[idx];
		scripts.path = `${scripts.path + urlSegments[idx - 1]}/`;

		const clientPath = resolve(`${scripts.path}client.ts`);
		const client = existsSync(clientPath) ? clientPath : undefined;
		if (client) {
			scripts.currentClientScripts.push(client);
		}
		const layoutPath = resolve(`${scripts.path}layout.ts`);
		const layout = existsSync(layoutPath) ? layoutPath : undefined;
		if (layout) {
			scripts.currentLayoutScripts.push(layout);
		}
		//console.log("SCRIPTS IN NODE ADD = ", scripts);
		//console.log("THIS ====", this);
		if (isFile(currentPart)) {
			if (!this.static) {
				this.static = new Map();
			}
			// console.log(" creating leaf node with name", currentPart);
			// const clientPath = resolve(
			// 	`./pages/${urlSegments.join("/").replace("page.ts", "client.ts")}`,
			// );
			// const client = existsSync(clientPath) ? clientPath : undefined;
			// const layoutPath = resolve(
			// 	`./pages/${urlSegments.join("/").replace("page.ts", "layout.ts")}`,
			// );
			//const layout = existsSync(layoutPath) ? clientPath : undefined;
			this.static?.set(
				currentPart,
				new Node({
					name: currentPart,
					isLeaf: true,
					layouts: scripts.currentLayoutScripts,
					clients: scripts.currentClientScripts,
					path: resolve(`./pages/${urlSegments.join("/")}`),
				}),
			);
			// console.log(
			// 	"node = ",
			// 	new Node({
			// 		name: currentPart,
			// 		isLeaf: true,
			// 		layouts,
			// 		clients,
			// 		path: resolve(`./pages/${urlSegments.join("/")}`),
			// 	}),
			// );
			// console.log(
			// 	new Node({
			// 		name: currentPart,
			// 		isLeaf: true,
			// 		layouts: scripts.currentLayoutScripts,
			// 		clients: scripts.currentClientScripts,
			// 		path: resolve(`./pages/${urlSegments.join("/")}`),
			// 	}),
			// );
			return;
		}
		if (isDynamicFolder(currentPart)) {
			if (isGroup(currentPart)) {
				let node = this.group?.get(currentPart);
				if (!node) {
					//console.log(" creating dynamic node with name", currentPart);
					node = new Node({
						name: currentPart,
					});
					if (!this.group) {
						this.group = new Map();
					}
					this.group?.set(currentPart, node);
				}
				node.add(urlSegments, idx + 1, scripts);
				return;
			}

			if (isParallel(currentPart)) {
				//console.log("isParallel(currentPart) =", currentPart);
				let node = this.parallel?.get(currentPart);
				//console.log("!!!@@@@@@@@isParallel node) =", node);
				if (!node) {
					if (!this.parallel) {
						//	console.log("no paralel!!!");
						this.parallel = new Map();
					}
					node = new Node({
						name: currentPart,
					});

					//console.log("creating parallel node with name = ", currentPart);

					this.parallel?.set(currentPart, node);
				}
				//console.log("this.parallel after set is =  ", this.parallel);
				node.add(urlSegments, idx + 1, scripts);
				return;
			}
			if (this.dynamic) {
				if (this.dynamic[0] !== currentPart) {
					throw new Error("Cannot be 2 to dynamic [] folders on one level");
				}
			} else {
				//console.log("creating dynamic node with name = ", currentPart);
				this.dynamic = [
					currentPart,
					new Node({
						name: currentPart,
					}),
				];
			}
			this.dynamic[1].add(urlSegments, idx + 1, scripts);
			return;
		}

		let node = this.static?.get(currentPart);

		if (!node) {
			//console.log("creating static node with name = ", currentPart);
			node = new Node({
				name: currentPart,
			});
			if (!this.static) {
				this.static = new Map();
			}
			this.static?.set(currentPart, node);
		}
		node.add(urlSegments, idx + 1, scripts);
	}
	print() {
		if (this.isLeaf) {
			console.log(`Leaf node with name =  ${this.name} and path ${this.path}`);
		}
		if (this.static) {
			for (const [, node] of this.static) {
				node.print();
			}
		}
		if (this.group) {
			for (const [, node] of this.group) {
				node.print();
			}
		}
		if (this.parallel) {
			for (const [name, node] of this.parallel) {
				node.print();
			}
		}
		if (this.dynamic) {
			this.dynamic[1].print();
		}
	}
}
class Storage {
	static?: Map<string, Node>;
	group?: Map<string, Node>;
	dynamic?: [string, Node];
	parallel?: Map<string, Node>;
	add(url: string) {
		const splitted = splitUrl(url);
		// console.log(splitted);
		const idx = 0;
		//@ts-ignore
		const currentPart = splitted[idx];
		const currentClientScripts: string[] = [];
		const currentLayoutScripts: string[] = [];
		const clientPath = resolve("./pages/client.ts");
		const client = existsSync(clientPath) ? clientPath : undefined;
		if (client) {
			currentClientScripts.push(client);
		}
		const layoutPath = resolve("./pages/layout.ts");
		const layout = existsSync(layoutPath) ? clientPath : undefined;
		if (layout) {
			currentLayoutScripts.push(layout);
		}
		const scripts = {
			currentClientScripts,
			currentLayoutScripts,
			path: "./pages/",
		};
		//console.log("SCRIPTS IN STORAGE = ", scripts);
		if (isFile(currentPart)) {
			if (!this.static) {
				this.static = new Map();
			}
			//console.log("creating leaf node with name = ", currentPart);
			// const client = resolve(`./pages/${url.replace("page.ts", "client.ts")}}`);
			// const layout = resolve(`./pages/${url.replace("page.ts", "layout.ts")}}`);
			this.static?.set(
				currentPart,
				new Node({
					name: currentPart,
					isLeaf: true,
					clients: scripts.currentClientScripts,
					layouts: scripts.currentLayoutScripts,
					path: resolve(`./pages/${url}}`),
				}),
			);
			return;
		}

		if (isDynamicFolder(currentPart)) {
			//	console.log("Storage dynamic for ", currentPart);
			if (isGroup(currentPart)) {
				let node = this.group?.get(currentPart);
				if (!node) {
					// console.log(
					// 	"in storage creating group node with name = ",
					// 	currentPart,
					// );
					node = new Node({
						name: currentPart,
					});
					if (!this.group) {
						this.group = new Map();
					}
					this.group?.set(currentPart, node);
				}
				node.add(splitted, 1, scripts);
				return;
			}
			if (isParallel(currentPart)) {
				let node = this.parallel?.get(currentPart);

				if (!node) {
					// console.log(
					// 	"in storage creating parallel node with name = ",
					// 	currentPart,
					// );
					node = new Node({
						name: currentPart,
					});
					if (!this.parallel) {
						this.parallel = new Map();
					}
					this.parallel?.set(currentPart, node);
				}
				node.add(splitted, 1, scripts);
				return;
			}
			// handle @ case of routing
			if (this.dynamic) {
				if (this.dynamic[0] !== currentPart) {
					throw new Error("Cannot be to dynamic [] folders on one level");
				}
			} else {
				// console.log(
				// 	"in storage creating dynamic node with name = ",
				// 	currentPart,
				// );
				this.dynamic = [
					currentPart,
					new Node({
						name: currentPart,
					}),
				];
			}

			this.dynamic[1].add(splitted, 1, scripts);
			return;
		}

		let node = this.static?.get(currentPart);

		if (!node) {
			node = new Node({
				name: currentPart,
			});
			if (!this.group) {
				this.group = new Map();
			}
			// console.log("in storage creating static node with name = ", currentPart);
			this.group?.set(currentPart, node);
		}
		node.add(splitted, 1, scripts);
	}
	find(url: string) {
		const splitted = splitUrl(url);
		// //@ts-ignore
		// const idx = 0;
		//@ts-ignore
		const staticNode = this.static?.get(splitted[0]);
		if (staticNode) {
			const matchResult = staticNode.find(splitted, 1);
			if (matchResult) {
				return matchResult;
			}
		}
		const groupNode = this.group?.get(splitted[0]);
		if (groupNode) {
			const matchResult = groupNode.find(splitted, 1);
			if (matchResult) {
				return matchResult;
			}
		}
		const parallelNode = this.parallel?.get(splitted[0]);
		if (parallelNode) {
			const matchResult = parallelNode.find(splitted, 1);
			if (matchResult) {
				return matchResult;
			}
		}
		//@ts-ignore
		return this.dynamic?.find(splitted, 1);
	}
	print() {
		if (this.static) {
			for (const [name, node] of this.static) {
				node.print();
			}
		}
		if (this.group) {
			for (const [name, node] of this.group) {
				node.print();
			}
		}
		if (this.parallel) {
			for (const [name, node] of this.parallel) {
				node.print();
			}
		}
		if (this.dynamic) {
			this.dynamic[1].print();
		}
	}
}

class FileSystemRouter {
	private files: string[] = [];
	private base;

	private routesMap = new Storage();

	constructor({ dir = "./pages", base = "" }: FileSystemRouterArgs) {
		this.base = base;
		//@ts-ignore
		this.files = getAllFilesPaths().filter((file) => file.endsWith("page.ts"));

		console.table(this.files);
		// if someone pass page.ts file in end of url push 404 or error page from root
		// const file = this.files[0];
		// this.routesMap.add(file);
		for (const file of this.files) {
			this.routesMap.add(file);
		}
		console.log("full print ----------- start ");
		this.routesMap.print();
		console.log("full print -----------end ");
		//console.log(this.routesMap.dynamic?.[1].group?.get("(blog)"));
	}

	match(url: string) {
		const splitted = removeBaseAndSplit(url, this.base);
		const routeMap = {
			"[lang]": {
				"(blog)": {
					"layout.ts": "/",
				},
				"(platform)": {
					"layout.ts": "/",
				},
				"layout.ts": "/",
				"page.ts": "/",
				"client.ts": "/",
			},
		};

		// for (const segment of splitted) {
		// 	Object.entries()
		// 	// find segment as is on high level
		// }
		console.log(splitted);
	}
}

const router = new FileSystemRouter({ base: "http://localhost:3000" });
router.match("http://localhost:3000/en/editor");
// // read all the files in the current directory, recursively

// const router = new Bun.FileSystemRouter({
// 	style: "nextjs",
// 	dir: "./pages",
// });
// const template = await Bun.file("./index.html").text();
// const base = "http://localhost:3000";

// const fileMap = {};
// const isClient = (input) => input.split("/").at(-1) === "client.ts";
// const isServer = (input) => input.split("/").at(-1) === "index.ts";
// const isLayout = (input) => input.split("/").at(-1) === "layout.ts";
// const isDot = (input: string) => input === ".";

// type RouteObj = {
// 	"client.ts"?: string;
// 	"index.ts"?: string;
// 	"layout.ts"?: string;
// };
// const getRelatedPath = (file: string) => {
// 	const splitted = file.split("/");
// 	const idx = splitted.findIndex((v) => v === "dist");
// 	if (idx !== -1) {
// 		for (let i = 0; i <= idx; i++) {
// 			splitted[i] = "";
// 		}
// 	}
// 	const scriptSrc = splitted.filter(Boolean).join("/");
// 	return scriptSrc;
// };
// const builder = async (input: string, outPath: string) => {
// 	const output = await Bun.build({
// 		entrypoints: [input],
// 		outdir: outPath,
// 		format: "esm",
// 		minify: true,
// 		naming: {
// 			entry: "[dir]/[name].[hash].[ext]",
// 		},
// 	});
// 	console.log("output =", output.success);
// 	// if ()
// 	// console.log("output.outputs[0]= ", output.outputs[0]);
// 	if (isClient(input)) {
// 		await Bun.write(
// 			output.outputs[0].path,
// 			(await Bun.file(output.outputs[0].path).text()).replace(
// 				/export{([a-zA-Z]) as client};/g,
// 				(_, letter) => `${letter}()`,
// 			),
// 		);
// 	} else {
// 		await Bun.write(
// 			output.outputs[0].path,
// 			(await Bun.file(output.outputs[0].path).text())
// 				.replace(/[\t\n]/g, "")
// 				.replaceAll('className=""', ""),
// 		);
// 	}

// 	const path = input.split("/").filter((v) => !isDot(v) && v !== "pages");
// 	if (path.length === 1) {
// 		if (isClient(input)) {
// 			const scriptSrc = getRelatedPath(output.outputs[0].path);

// 			fileMap[path[0]] = scriptSrc;

// 			return;
// 		}
// 		fileMap[path[0]] = output.outputs[0].path;
// 	} else {
// 		let link = fileMap;
// 		for (let i = 0; i < path.length; i++) {
// 			const isLast = path.length - 1 === i;
// 			const file = output.outputs[0].path;
// 			if (isLast) {
// 				if (isClient(input)) {
// 					const scriptSrc = getRelatedPath(file);

// 					link["client.ts"] = scriptSrc;
// 					return;
// 				}
// 				if (isServer(input)) {
// 					link["index.ts"] = file;
// 					return;
// 				}
// 				if (isLayout(input)) {
// 					link["layout.ts"] = file;
// 					return;
// 				}
// 			}
// 			if (!link[path[i]]) {
// 				link[path[i]] = {} as RouteObj;
// 			}
// 			link = link[path[i]];
// 		}
// 	}
// };

// const ls = async (path: string) => await $`ls ./${path}`.text();
// const allNamesInFolder = async (path: string) => (await ls(path)).split("\n");

// const isTsOrTsx = (file: string) =>
// 	file.endsWith(".tsx") || file.endsWith(".ts");

// const filterTsFiles = (list: string[]) => list.filter(isTsOrTsx);
// const filterFolders = (list: string[]) =>
// 	list.filter((file) => !isTsOrTsx(file));

// const process = async (path = "./pages", outpath = "./dist") => {
// 	const list = (await allNamesInFolder(path)).filter(Boolean);
// 	if (list.length) {
// 		const jsFiles = filterTsFiles(list);
// 		for (const file of jsFiles) {
// 			await builder(`${path}/${file}`, `${outpath}`);
// 		}
// 		const folders = filterFolders(list);
// 		for (const folder of folders) {
// 			await $`mkdir -p ${outpath}/${folder}`;
// 			await process(`${path}/${folder}`, `${outpath}/${folder}`);
// 		}
// 	}
// };

// await process();

// const watcher = watch(
// 	"./pages",
// 	{ recursive: true },
// 	async (event, filename) => {
// 		const splitted = filename?.split("/");
// 		// if (splitted?.at(-1) === "layout.ts") {
// 		// 	console.log("layout should be rebuilded");
// 		// }
// 		if (splitted) {
// 			splitted.pop();
// 			const outdir = splitted.join("/");
// 			await builder(`./pages/${filename}`, `./dist/${outdir}`);
// 			//console.log(`Detected ${event} in ${filename}`);
// 		}
// 	},
// );

// const buildTemplate = async (path: string[]) => {
// 	let currentTemplate = "";
// 	let link = fileMap;
// 	for (let i = 0; i < path.length; i++) {
// 		const chunk = path[i];
// 		const isInnerLayout = link[chunk] && link["layout.ts"];
// 		if (isInnerLayout) {
// 			const innerLayout = await (await import(link["layout.ts"])).server();
// 			if (currentTemplate) {
// 				currentTemplate = currentTemplate.replace("<!--slot-->", innerLayout);
// 			} else {
// 				currentTemplate = innerLayout;
// 			}
// 		}

// 		link = link[chunk];
// 	}
// 	return currentTemplate;
// };
// const getPageFiles = async (path: string[]) => {
// 	let link = fileMap;
// 	const clientScripts: string[] = [];
// 	let currentPath = "";
// 	for (const chunk of path) {
// 		currentPath += chunk;
// 		if (link["client.ts"]) {
// 			clientScripts.push(link["client.ts"]);
// 		}
// 		if (!link[chunk] || chunk.endsWith(".ts")) {
// 			return {
// 				clientScripts,
// 				server: link["index.ts"]
// 					? await (await import(link["index.ts"])).server()
// 					: "",
// 			};
// 		}
// 		link = link[chunk];
// 	}
// 	return null;
// };

// Bun.serve({
// 	port: 3000,
// 	async fetch(req) {
// 		const replaced = req.url.replace(base, "");
// 		const path = router.match(replaced || "/");

// 		if (path) {
// 			//@ts-ignore
// 			const splittedPath = path.scriptSrc.split("/");
// 			// biome-ignore lint/style/noNonNullAssertion: <explanation>
// 			const data = await getPageFiles(splittedPath)!;
// 			if (data) {
// 				const { clientScripts, server } = data;
// 				const layout = await buildTemplate(splittedPath);
// 				const replacedLayout = layout.replace("<!--slot-->", server);
// 				const scriptsWrapped =
// 					clientScripts
// 						.map((client) => `<script src=${base}/${client} defer></script>`)
// 						.join("") || "";

// 				const html = template
// 					// .replace("<!--app-head-->", rendered.head ?? "")
// 					.replace("<!--app-html-->", replacedLayout ?? "")
// 					.replace("<!--app-client-->", scriptsWrapped);
// 				return new Response(html, { headers: { "Content-type": "text/html" } });
// 			}
// 		}
// 		if (req.url.endsWith(".js")) {
// 			req.url.split("/");
// 			const file = await Bun.file(`./dist${replaced}`).text();

// 			return new Response(file, {
// 				headers: { "Content-type": "application/javascript" },
// 			});
// 		}
// 		req.referrer;
// 		return new Response("404!");
// 	},
// });
