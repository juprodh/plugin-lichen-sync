import { type App, Modal, Setting } from "obsidian";

interface Confirmation {
	readonly title: string;
	readonly message: string;
	/** The button that goes ahead. */
	readonly action: string;
	/** Styles the action as one that forgets or loses something. */
	readonly warning?: boolean;
}

/** Whether the user went ahead; closing the dialog any other way cancels. */
export function confirm(
	app: App,
	confirmation: Confirmation,
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, confirmation, resolve).open();
	});
}

class ConfirmModal extends Modal {
	private confirmed = false;

	constructor(
		app: App,
		private readonly confirmation: Confirmation,
		private readonly onDone: (confirmed: boolean) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const { title, message, action, warning } = this.confirmation;
		this.setTitle(title);
		this.contentEl.createEl("p", { text: message });
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => this.close()),
			)
			.addButton((button) => {
				button.setButtonText(action).onClick(() => {
					this.confirmed = true;
					this.close();
				});
				if (warning) button.setWarning();
				else button.setCta();
			});
	}

	override onClose(): void {
		this.contentEl.empty();
		this.onDone(this.confirmed);
	}
}
