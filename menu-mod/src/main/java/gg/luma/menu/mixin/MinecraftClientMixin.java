package gg.luma.menu.mixin;

import gg.luma.menu.LumaPauseScreen;
import gg.luma.menu.LumaTitleScreen;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.GameMenuScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(MinecraftClient.class)
abstract class MinecraftClientMixin {
	/** Every way to the title screen — start-up, leaving a world or the server — lands on Luma's,
	 * and Esc in game opens Luma's pause menu (not the F3+Esc pause, which has no menu). */
	@ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
	private Screen luma$screen(Screen screen) {
		if (screen instanceof TitleScreen) return new LumaTitleScreen();
		if (screen != null && screen.getClass() == GameMenuScreen.class && ((GameMenuScreen) screen).shouldShowMenu()) return new LumaPauseScreen();
		return screen;
	}
}
