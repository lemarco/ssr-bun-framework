import { getElementById, updateElementContent } from "../../utils/dom";
export const client = (): void => {
	console.log("layout script");
	const element = getElementById("#counter");
	if (element) {
		let counter = 0;
		const setCounter = (count: number) => {
			counter = count;

			updateElementContent(element, `count is ${counter}`);
		};
		element.addEventListener("click", () => setCounter(counter + 1));
		setCounter(0);
	}
};
