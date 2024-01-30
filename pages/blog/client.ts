import { getElementById, updateElementContent } from "../../utils/dom";
export const client = (): void => {
	console.log("--start--");
	const a: number = 22;
	console.log("--end--");
	console.log("lol script");
	const element = getElementById("#counter");
	if (element) {
		let counter = 0;
		const setCounter = (count: number) => {
			counter = count;
			console.log("if inner html");
			updateElementContent(element, `count is ${counter}`);
		};
		element.addEventListener("click", () => setCounter(counter + 1));
		setCounter(0);
	}
};
