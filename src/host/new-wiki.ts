import { toWikiSlug } from "@lichen-wiki/client/slug";
import type { NewWikiFields } from "@lichen-wiki/sync/new-wiki";
import {
	type App,
	getLanguage,
	Modal,
	Setting,
	type TextComponent,
} from "obsidian";

// lichen.wiki's quick picks (lichen-repo/src/util/languages.ts); the wiki's settings there offer every language.
const COMMON_LANGUAGE_CODES = [
	"en",
	"fr",
	"es",
	"de",
	"pt",
	"ja",
	"zh",
	"ko",
	"ar",
	"eo",
];

interface NewWikiForm {
	readonly name: string;
	/** What the address follows: "lichen.wiki/@alice.test/". */
	readonly addressPrefix: string;
	/** Creates the wiki: the problem to show, or null once it exists. */
	submit(fields: NewWikiFields): Promise<string | null>;
	onClose(): void;
}

/** Name, address and language, as lichen.wiki's form asks; the rest is set there. */
export class NewWikiModal extends Modal {
	private name: string;
	private slug = "";
	private language = getLanguage() || "en";
	private creating = false;

	constructor(
		app: App,
		private readonly form: NewWikiForm,
	) {
		super(app);
		this.name = form.name;
	}

	override onOpen(): void {
		const { contentEl } = this;
		this.setTitle("New wiki");
		let addressInput: TextComponent | undefined;
		const derived = () => toWikiSlug(this.name) || "my-wiki";

		new Setting(contentEl).setName("Name").addText((text) => {
			text
				.setPlaceholder("My wiki")
				.setValue(this.name)
				.onChange((value) => {
					this.name = value;
					addressInput?.setPlaceholder(derived());
					showAddress();
				});
			window.setTimeout(() => text.inputEl.focus());
		});

		const addressSetting = new Setting(contentEl).setName("Address");
		const showAddress = () =>
			addressSetting.setDesc(
				`${this.form.addressPrefix}${this.slug.trim() || toWikiSlug(this.name)}, fixed once created.`,
			);
		addressSetting.addText((text) => {
			addressInput = text;
			text.setPlaceholder(derived()).onChange((value) => {
				this.slug = value;
				showAddress();
			});
		});
		showAddress();

		new Setting(contentEl)
			.setName("Language")
			.setDesc("The language its notes are written in.")
			.addDropdown((dropdown) => {
				for (const code of languageChoices(this.language)) {
					dropdown.addOption(code, languageLabel(code));
				}
				dropdown
					.setValue(this.language)
					.onChange((value) => (this.language = value));
			});

		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: "Anyone can read it on lichen.wiki. Its description, theme and members are set there.",
		});
		const problem = contentEl.createEl("p", { cls: "mod-warning" });

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText("Create")
					.setCta()
					.onClick(async () => {
						if (this.creating) return;
						this.creating = true;
						button.setDisabled(true).setButtonText("Creating…");
						problem.setText("");
						try {
							const refused = await this.form.submit({
								name: this.name,
								slug: this.slug,
								language: this.language,
							});
							if (refused === null) this.close();
							else problem.setText(refused);
						} finally {
							this.creating = false;
							button.setDisabled(false).setButtonText("Create");
						}
					}),
			);
	}

	override onClose(): void {
		this.contentEl.empty();
		this.form.onClose();
	}
}

function languageChoices(current: string): string[] {
	return COMMON_LANGUAGE_CODES.includes(current)
		? COMMON_LANGUAGE_CODES
		: [current, ...COMMON_LANGUAGE_CODES];
}

// The language's own name, "Français (fr)", as lichen.wiki's language switcher shows it.
function languageLabel(code: string): string {
	try {
		const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
		if (!name) return code;
		return `${name.charAt(0).toLocaleUpperCase(code)}${name.slice(1)} (${code})`;
	} catch {
		return code;
	}
}
