import { $ } from "bun";

const ls = async (path: string) => await $`ls ./${path}`.text();
const allNamesInFolder = async (path: string) => (await ls(path)).split("\n");
const build = async () =>
	await $`tsc -p ./tsconfig.frontend.json                                            `;
const minify = async (path: string) =>
	await $`bunx terser -o ${path} --compress --mangle -- ${path}`;
const filterJsFiles = (list: string[]) =>
	list.filter((file) => file.endsWith(".js"));
const filterFolders = (list: string[]) =>
	list.filter((file) => !file.endsWith(".js"));
const process = async (path = "./dist") => {
	const list = (await allNamesInFolder(path)).filter(Boolean);
	if (list.length) {
		const jsFiles = filterJsFiles(list);
		for (const file of jsFiles) {
			const module = await import(`.${path}/${file}`);
			if (module.client) {
				await Bun.write(`${path}/${file}`, `(${module.client.toString()})()`);
				await minify(`${path}/${file}`);
			}
		}
		const folders = filterFolders(list);
		for (const folder of folders) {
			await process(`${path}/${folder}`);
		}
	}
};
await build();
await process();
