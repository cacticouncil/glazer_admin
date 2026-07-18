using System;
using Avalonia.Data;
using Avalonia.Markup.Xaml;

namespace GlazerAdmin.Services;

/// <summary>
/// XAML markup extension for localized strings: Header="{svc:Localize filebar.open}".
/// Produces a binding to <see cref="Loc"/>'s indexer, so strings update live on
/// language change.
/// </summary>
public class LocalizeExtension : MarkupExtension
{
    public string Key { get; set; }

    public LocalizeExtension(string key) => Key = key;

    public override object ProvideValue(IServiceProvider serviceProvider) =>
        new Binding($"[{Key}]")
        {
            Source = Loc.Instance,
            Mode = BindingMode.OneWay,
        };
}
