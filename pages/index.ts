export const server = (): string | Promise<string> => {
	console.log("server");
	const arr = [
		{ a: 1, b: "sadfsd" },
		{ a: 2, b: "asd!@#Edfsd" },
	];
	const part = arr
		.map((el, idx) => `<div>${el.b} index = ${idx}</div>`)
		.join("");
	console.log(part);

	return /*html*/ ` <div class > 
      ${part}
      <h1 id="lol">Hello Vite!</h1>
      <div class="card">
        <button id="counter" type="button"></button>
      </div>
      <p class="read-the-docs">
        Click on the Vite logo to learn more
      </p>
    </div>
  `;
};

export const client = () => {
	//@ts-ignore
	const element = document.querySelector("#counter");
	let counter = 0;
	const setCounter = (count: number) => {
		counter = count;
		if (element?.innerHTML) {
			element.innerHTML = `count is ${counter}`;
		}
	};
	element?.addEventListener("click", () => setCounter(counter + 1));
	setCounter(0);
};
