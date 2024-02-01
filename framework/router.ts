import { $ } from "bun";
import { watch } from "fs";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { builder, fileMap } from "./builder";
import {
	getAllPagesPaths,
	isDynamicFolder,
	isFile,
	isGroup,
	isParallel,
	splitUrl,
} from "./utils";
type FileSystemRouterArgs = {
	dir?: string;
	base?: string;
};

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
	private processParrallelMatch(
		urlSegments: string[],
		matchedPath: string,
	): Node {
		return this;
	}
	find(urlSegments: string[], idx: number): Node | undefined {
		console.log("CURRENT SEGMENT in NODE= ", urlSegments[idx]);
		if (this.static) {
			for (const [name, node] of this.static) {
				console.log("11111 name = ", name);

				if (name === urlSegments[idx]) {
					console.log("222222");
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

		if (this.group) {
			//console.log("IN STORAGE FIND IN DYNAMIC= ", this.group);
			for (const [name, node] of this.group) {
				const matchResult = node.find(urlSegments, idx);
				if (matchResult) {
					return matchResult;
				}
			}
		}
		if (this.parallel) {
			//console.log("IN parallel FIND IN DYNAMIC= ", this.parallel);
			for (const [name, node] of this.parallel) {
				const matchResult = node.find(urlSegments, idx);

				if (matchResult) {
					// biome-ignore lint/style/noNonNullAssertion: <explanation>
					return this.processParrallelMatch(urlSegments, matchResult?.path!);
				}
			}
		}
		return this.dynamic?.[1].find(urlSegments, idx + 1);
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
		console.log("IN STORAGE FIND = ", url);
		const splitted = splitUrl(url).filter(Boolean);
		const isSegmentFile = isFile(splitted[0]);
		if (isSegmentFile) {
			const staticNode = this.static?.get(splitted[0]);
			if (staticNode) {
				const matchResult = staticNode.find(splitted, 1);
				if (matchResult) {
					return matchResult;
				}
			}
		}
		const groupNode = this.group?.get(splitted[0]);
		if (groupNode) {
			const matchResult = groupNode.find(splitted, 0);
			if (matchResult) {
				return matchResult;
			}
		}
		const parallelNode = this.parallel?.get(splitted[0]);
		if (parallelNode) {
			const matchResult = parallelNode.find(splitted, 1);
			if (matchResult) {
				console.log(this);
				return this;
			}
		}
		console.log("IN STORAGE FIND IN DYNAMIC= ", url);
		return this.dynamic?.[1]?.find(splitted, 1);
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
export class FileSystemRouter {
	private files: string[] = [];
	private base;

	private routesMap = new Storage();

	constructor({ dir = "./pages", base = "" }: FileSystemRouterArgs) {
		this.base = base;
		this.files = getAllPagesPaths(dir);
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
		const prepared = url.replace(this.base, "");
		return this.routesMap.find(prepared);
	}
}
