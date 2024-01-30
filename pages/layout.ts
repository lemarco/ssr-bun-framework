const html = (arg: TemplateStringsArray) => `${arg}`;
//

export const server = () => {
	return /*html*/ html`
    <div id='layout' class="">
    <div></div>
        <!--slot-->
    </div>
`;
};
