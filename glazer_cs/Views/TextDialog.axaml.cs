using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Interactivity;

namespace GlazerAdmin.Views;

/// <summary>Simple modal dialog showing a title and multi-paragraph text
/// (used for Help → About / Instructions).</summary>
public partial class TextDialog : Window
{
    public TextDialog()
    {
        InitializeComponent();
    }

    public static Task ShowAsync(Window owner, string title, string body)
    {
        var dialog = new TextDialog { Title = title };
        dialog.BodyText.Text = body;
        return dialog.ShowDialog(owner);
    }

    private void OnCloseClick(object? sender, RoutedEventArgs e) => Close();
}
