using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using GlazerAdmin.Services;

namespace GlazerAdmin.ViewModels;

/// <summary>
/// Root view model. For the UI skeleton this holds tool selection, language
/// switching, and stub commands for actions still to be ported (file loading,
/// models, preprocessing, export).
/// </summary>
public partial class MainViewModel : ViewModelBase
{
    /// <summary>Exposed for XAML bindings that need localization via DataContext.</summary>
    public Loc L => Loc.Instance;

    [ObservableProperty]
    private string _currentTool = "Pan";

    [ObservableProperty]
    private int _imageCount;

    [RelayCommand]
    private void SelectTool(string toolName)
    {
        if (CurrentTool == toolName)
        {
            // Re-raise so a toggle button that just unchecked itself snaps back.
            OnPropertyChanged(nameof(CurrentTool));
            return;
        }

        CurrentTool = toolName;
    }

    [RelayCommand]
    private void DeleteSelected()
    {
        // Stub: annotation model lands with the ToolSystem port.
    }

    [RelayCommand]
    private void SetLanguage(string language)
    {
        Loc.Instance.SetLanguage(language);
        SettingsService.Current.Language = language;
        SettingsService.Save();
    }

    // --- Stubs for features ported in later steps ---

    [RelayCommand] private void OpenFiles() { }
    [RelayCommand] private void OpenFolder() { }
    [RelayCommand] private void CloseCurrentFile() { }
    [RelayCommand] private void ClearAllFiles() { }
    [RelayCommand] private void ExportAll() { }
    [RelayCommand] private void ExportCurrent() { }
    [RelayCommand] private void UploadModel() { }
    [RelayCommand] private void Preprocess() { }
}
