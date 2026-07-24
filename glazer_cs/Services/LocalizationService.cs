using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Text.Json;
using Avalonia.Platform;

namespace GlazerAdmin.Services;

/// <summary>
/// Runtime-switchable string localization backed by the JSON locale assets
/// (ported from the original web app's i18next files). Japanese is the
/// default and fallback language, per KITC requirements.
/// </summary>
public sealed class Loc : INotifyPropertyChanged
{
    public const string DefaultLanguage = "ja";

    public static Loc Instance { get; } = new();

    private readonly Dictionary<string, Dictionary<string, string>> _tables = new();
    private string _language = DefaultLanguage;

    public event PropertyChangedEventHandler? PropertyChanged;

    private Loc()
    {
        foreach (var lang in new[] { "ja", "en" })
            _tables[lang] = LoadTable(lang);
    }

    public string Language => _language;

    /// <summary>Looks up a dot-separated key ("filebar.open") in the current
    /// language, falling back to Japanese, then to the key itself.</summary>
    public string this[string key]
    {
        get
        {
            if (_tables.TryGetValue(_language, out var table) && table.TryGetValue(key, out var value))
                return value;
            if (_language != DefaultLanguage && _tables[DefaultLanguage].TryGetValue(key, out var fallback))
                return fallback;
            return key;
        }
    }

    /// <summary>Interpolates named placeholders, e.g. Format("app.export.loadingImage", ("current", 2), ("total", 5)).</summary>
    public string Format(string key, params (string Name, object Value)[] args)
    {
        var text = this[key];
        foreach (var (name, value) in args)
            text = text.Replace("{" + name + "}", value?.ToString() ?? "");
        return text;
    }

    public void SetLanguage(string language)
    {
        if (!_tables.ContainsKey(language) || language == _language)
            return;

        _language = language;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Language)));
        // "Item[]" invalidates every indexer binding, refreshing all bound strings.
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs("Item[]"));
    }

    private static Dictionary<string, string> LoadTable(string lang)
    {
        var flat = new Dictionary<string, string>();
        using var stream = AssetLoader.Open(new Uri($"avares://GlazerAdmin/Assets/Locales/{lang}.json"));
        using var doc = JsonDocument.Parse(stream);
        Flatten(doc.RootElement, "", flat);
        return flat;
    }

    private static void Flatten(JsonElement element, string prefix, Dictionary<string, string> into)
    {
        foreach (var prop in element.EnumerateObject())
        {
            var key = prefix.Length == 0 ? prop.Name : $"{prefix}.{prop.Name}";
            if (prop.Value.ValueKind == JsonValueKind.Object)
                Flatten(prop.Value, key, into);
            else
                into[key] = prop.Value.GetString() ?? "";
        }
    }
}
