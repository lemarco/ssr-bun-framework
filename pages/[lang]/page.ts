import { html } from "../../utils/html";
export const server = (): string => {
	const arr = [
		{ a: 1, b: "sadfsd" },
		{ a: 2, b: "asd!@#Edfsd" },
	];
	const part = arr
		.map((el, idx) => `<div>${el.b} index = ${idx}</div>`)
		.join("");

	return html`
	<div>
		${part}
		<h1 id="lol">HOME PAGE</h1>
		<div className="card">
			<button id="counter" type="button"></button>
		</div>
		<p className="read-the-docs">Click on the Vite logo to learn more</p>
	</div>
	`;
};
