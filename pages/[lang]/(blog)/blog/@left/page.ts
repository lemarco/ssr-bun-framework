import { html } from "../../../../../utils/html";

export const server = (): string => {
	return html`
	<div id="(blog)-blog-@left-page" >

		<h1 id="lol">Hello Vite!</h1>
		<div className="card">
			<button id="counter" type="button" >		</button >
		</div>
		<p className="read-the-docs">Click on the Vite logo to learn more</p>
	</div>

`;
};
