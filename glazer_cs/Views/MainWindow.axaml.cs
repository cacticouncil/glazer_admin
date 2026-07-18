using Avalonia.Controls;
using Avalonia.Interactivity;
using GlazerAdmin.Services;

namespace GlazerAdmin.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private async void OnAboutClick(object? sender, RoutedEventArgs e) =>
        await TextDialog.ShowAsync(this, Loc.Instance["filebar.about"], Loc.Instance["filebar.aboutText"]);

    private async void OnInstructionsClick(object? sender, RoutedEventArgs e) =>
        await TextDialog.ShowAsync(this, Loc.Instance["filebar.instructions"], Loc.Instance["filebar.instructionsText"]);
}
